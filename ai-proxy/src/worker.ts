// ─────────────────────────────────────────────────────────────────────
// Scrolls AI Proxy — Cloudflare Worker
//
// Forwards POST requests from the Scrolls browser app to Anthropic's
// Messages API, injecting the API key from a Worker secret. The browser
// never sees the key.
//
// Hardening:
//   • Origin allow-list (CORS preflight + actual request check)
//   • Model pinned to claude-haiku-4-5-20251001
//   • Whisper transcription available at POST /transcribe
//   • max_tokens capped at 2048
//   • Per-IP rate limit via KV
//   • No request logging of message contents
// ─────────────────────────────────────────────────────────────────────

import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

interface Env {
    ANTHROPIC_API_KEY: string;
    OPENAI_API_KEY?: string;
    ALLOWED_ORIGINS: string;
    RATE_LIMIT_PER_WINDOW: string;
    RATE_LIMIT_WINDOW_SECONDS: string;
    RATE_LIMIT: KVNamespace;
    LINKS: KVNamespace;
    /** Comma-separated list of origins permitted to host the short-link target. */
    SHORT_LINK_ALLOWED_TARGETS?: string;
    /** Bech32 (suiprivkey1…) secret for the relay account that sponsors
     *  on-chain submission anchoring for wallet-less respondents. */
    RELAY_PRIVATE_KEY?: string;
    /** Move package id on Sui mainnet (form_pointer / submission_ref). */
    SCROLLS_PACKAGE_MAINNET?: string;
}

const ALLOWED_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 2048;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BYTES = 1 * 1024 * 1024; // 1 MB cap on JSON payloads.
const MAX_SYSTEM_PROMPT_CHARS = 16_000; // ~4k tokens of system instructions.
const UPSTREAM_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_TRANSCRIBE_MODEL = "whisper-1";

interface AnthropicRequest {
    model?: string;
    max_tokens?: number;
    system?: string;
    messages?: Array<{ role: string; content: unknown }>;
    temperature?: number;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin") ?? "";
        const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
        const corsOrigin = allowed.has(origin) ? origin : null;

        // ── CORS preflight ────────────────────────────────────────
        if (request.method === "OPTIONS") {
            if (!corsOrigin) return new Response(null, { status: 403 });
            return new Response(null, {
                status: 204,
                headers: corsHeaders(corsOrigin),
            });
        }

        // ── Public short-link redirect (no Origin / no rate-limit) ──
        // GET /s/:code is hit directly by browsers following share links,
        // so it must work without a CORS Origin header.
        if (request.method === "GET" && url.pathname.startsWith("/s/")) {
            const tail = url.pathname.slice(3);
            if (tail.endsWith("/info")) {
                return handleShortLinkInfo(tail.slice(0, -5), env, corsOrigin);
            }
            return handleShortLinkRedirect(tail, env);
        }

        // ── Rate limit ────────────────────────────────────────────
        const ip =
            request.headers.get("CF-Connecting-IP") ??
            request.headers.get("x-forwarded-for") ??
            "anonymous";
        const limited = await checkRateLimit(env, ip);
        if (limited) {
            return json(
                { error: "Rate limit exceeded. Try again in a few minutes." },
                429,
                corsOrigin,
            );
        }

        // ── Short-link create / delete ────────────────────────────
        if (url.pathname === "/s" || url.pathname.startsWith("/s/")) {
            if (!corsOrigin) {
                return json({ error: "Origin not allowed" }, 403, null);
            }
            if (request.method === "POST" && url.pathname === "/s") {
                return handleShortLinkCreate(request, env, corsOrigin);
            }
            if (request.method === "DELETE" && url.pathname.startsWith("/s/")) {
                return handleShortLinkDelete(
                    request,
                    url.pathname.slice(3),
                    env,
                    corsOrigin,
                );
            }
            return json({ error: "Method not allowed" }, 405, corsOrigin);
        }

        // ── Existing AI routes are POST-only ──────────────────────
        if (request.method !== "POST") {
            return json({ error: "Method not allowed" }, 405, corsOrigin);
        }
        if (!corsOrigin) {
            return json({ error: "Origin not allowed" }, 403, null);
        }

        if (url.pathname === "/transcribe") {
            return handleTranscription(request, env, corsOrigin);
        }

        if (url.pathname === "/analyze") {
            return handleAnalyze(request, env, corsOrigin);
        }

        if (url.pathname === "/record") {
            return handleRecordSubmission(request, env, corsOrigin);
        }

        if (url.pathname !== "/") {
            return json({ error: "Not found" }, 404, corsOrigin);
        }

        // ── Parse + sanitize body ─────────────────────────────────
        const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
        if (contentLength > MAX_REQUEST_BYTES) {
            return json({ error: "Request body too large." }, 413, corsOrigin);
        }
        let body: AnthropicRequest;
        try {
            body = (await request.json()) as AnthropicRequest;
        } catch {
            return json({ error: "Invalid JSON body" }, 400, corsOrigin);
        }

        if (!Array.isArray(body.messages) || body.messages.length === 0) {
            return json({ error: "messages[] required" }, 400, corsOrigin);
        }

        const safeBody = {
            model: ALLOWED_MODEL,
            max_tokens: Math.min(
                typeof body.max_tokens === "number" ? body.max_tokens : 1024,
                MAX_TOKENS_CAP,
            ),
            ...(typeof body.system === "string"
                ? { system: body.system.slice(0, MAX_SYSTEM_PROMPT_CHARS) }
                : {}),
            messages: body.messages,
            ...(typeof body.temperature === "number"
                ? { temperature: clamp(body.temperature, 0, 1) }
                : {}),
        };

        // ── Forward to Anthropic ──────────────────────────────────
        const upstream = await fetchWithTimeout(
            ANTHROPIC_URL,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": env.ANTHROPIC_API_KEY,
                    "anthropic-version": ANTHROPIC_VERSION,
                },
                body: JSON.stringify(safeBody),
            },
            UPSTREAM_TIMEOUT_MS,
        );

        if (!upstream) {
            return json({ error: "Upstream timed out." }, 504, corsOrigin);
        }

        // Stream the upstream body straight back, preserving status.
        const headers = new Headers(corsHeaders(corsOrigin));
        headers.set(
            "Content-Type",
            upstream.headers.get("Content-Type") ?? "application/json",
        );
        return new Response(upstream.body, {
            status: upstream.status,
            headers,
        });
    },
} satisfies ExportedHandler<Env>;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function parseAllowedOrigins(raw: string): Set<string> {
    return new Set(
        (raw ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    );
}

function corsHeaders(origin: string): HeadersInit {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
    };
}

function json(payload: unknown, status: number, corsOrigin: string | null): Response {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (corsOrigin) {
        for (const [k, v] of Object.entries(corsHeaders(corsOrigin))) {
            headers.set(k, v as string);
        }
    }
    return new Response(JSON.stringify(payload), { status, headers });
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response | null> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
        if ((err as Error).name === "AbortError") return null;
        throw err;
    } finally {
        clearTimeout(t);
    }
}

async function checkRateLimit(env: Env, ip: string): Promise<boolean> {
    const limit = parseInt(env.RATE_LIMIT_PER_WINDOW, 10) || 60;
    const window = parseInt(env.RATE_LIMIT_WINDOW_SECONDS, 10) || 600;
    const key = `rl:${ip}`;
    const current = await env.RATE_LIMIT.get(key);
    const count = current ? parseInt(current, 10) || 0 : 0;
    if (count >= limit) return true;
    await env.RATE_LIMIT.put(key, String(count + 1), {
        expirationTtl: window,
    });
    return false;
}

async function handleTranscription(
    request: Request,
    env: Env,
    corsOrigin: string,
): Promise<Response> {
    if (!env.OPENAI_API_KEY) {
        return json(
            { error: "OPENAI_API_KEY is not configured for transcription." },
            501,
            corsOrigin,
        );
    }

    // Reject oversize uploads BEFORE buffering the multipart body.
    const declaredLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
    if (declaredLength > MAX_AUDIO_BYTES) {
        return json({ error: "Audio file exceeds the 25MB limit." }, 413, corsOrigin);
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return json({ error: "Invalid multipart body" }, 400, corsOrigin);
    }

    const entry = formData.get("file");
    if (!entry || typeof entry === "string") {
        return json({ error: "file is required" }, 400, corsOrigin);
    }
    const file = entry as File;
    if (file.size === 0) {
        return json({ error: "file is empty" }, 400, corsOrigin);
    }
    if (file.size > MAX_AUDIO_BYTES) {
        return json({ error: "Audio file exceeds the 25MB limit." }, 413, corsOrigin);
    }

    const upstreamForm = new FormData();
    upstreamForm.set("file", file, file.name || "scrolls-voice-note.webm");
    upstreamForm.set("model", OPENAI_TRANSCRIBE_MODEL);
    upstreamForm.set("response_format", "json");

    const upstream = await fetchWithTimeout(
        OPENAI_TRANSCRIBE_URL,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            },
            body: upstreamForm,
        },
        UPSTREAM_TIMEOUT_MS,
    );

    if (!upstream) {
        return json({ error: "Upstream timed out." }, 504, corsOrigin);
    }

    const headers = new Headers(corsHeaders(corsOrigin));
    headers.set(
        "Content-Type",
        upstream.headers.get("Content-Type") ?? "application/json",
    );

    return new Response(upstream.body, {
        status: upstream.status,
        headers,
    });
}

// ─────────────────────────────────────────────────────────────────────
// /analyze — structured submission triage
//
// Accepts a flattened submission transcript and returns a strict JSON
// shape (`AIAnalysis`). The system prompt is pinned server-side so the
// browser cannot ask the model anything else through this route.
// ─────────────────────────────────────────────────────────────────────

const MAX_TRANSCRIPT_CHARS = 12_000;
const ANALYZE_SYSTEM_PROMPT = `You triage form submissions for Scrolls.

Return ONLY a JSON object with this exact shape — no prose, no markdown:

{
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": number,        // 0..1
  "topics": string[],              // 1-5 short, lower-case noun phrases
  "suggestedPriority": "low" | "medium" | "high" | "critical",
  "summary": string                // <= 200 characters, neutral wording
}

Priority guidance:
- critical: outage, security, payment failure, harm
- high:     blocker for the user but bounded
- medium:   actionable feedback, feature requests
- low:      praise, FYI, minor issues`;

interface AnalyzeRequest {
    transcript?: unknown;
    formTitle?: unknown;
    formDescription?: unknown;
}

interface ParsedAnalysis {
    sentiment: "positive" | "neutral" | "negative";
    sentimentScore: number;
    topics: string[];
    suggestedPriority: "low" | "medium" | "high" | "critical";
    summary: string;
}

async function handleAnalyze(
    request: Request,
    env: Env,
    corsOrigin: string,
): Promise<Response> {
    const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
    if (contentLength > MAX_REQUEST_BYTES) {
        return json({ error: "Request body too large." }, 413, corsOrigin);
    }
    let body: AnalyzeRequest;
    try {
        body = (await request.json()) as AnalyzeRequest;
    } catch {
        return json({ error: "Invalid JSON body" }, 400, corsOrigin);
    }

    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) {
        return json({ error: "transcript is required" }, 400, corsOrigin);
    }
    const title = typeof body.formTitle === "string" ? body.formTitle.slice(0, 200) : "";
    const desc = typeof body.formDescription === "string" ? body.formDescription.slice(0, 500) : "";

    const userText = [
        title ? `Form: ${title}` : "",
        desc ? `Description: ${desc}` : "",
        "",
        transcript.slice(0, MAX_TRANSCRIPT_CHARS),
    ]
        .filter(Boolean)
        .join("\n");

    const upstream = await fetchWithTimeout(
        ANTHROPIC_URL,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": env.ANTHROPIC_API_KEY,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify({
                model: ALLOWED_MODEL,
                max_tokens: 512,
                temperature: 0.2,
                system: ANALYZE_SYSTEM_PROMPT,
                messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
            }),
        },
        UPSTREAM_TIMEOUT_MS,
    );

    if (!upstream) {
        return json({ error: "Upstream timed out." }, 504, corsOrigin);
    }
    if (!upstream.ok) {
        const detail = await safeText(upstream);
        return json(
            { error: `Upstream error ${upstream.status}: ${detail || "unknown"}` },
            upstream.status,
            corsOrigin,
        );
    }

    let upstreamJson: { content?: Array<{ type: string; text?: string }> };
    try {
        upstreamJson = (await upstream.json()) as typeof upstreamJson;
    } catch {
        return json({ error: "Upstream returned non-JSON." }, 502, corsOrigin);
    }

    const text = upstreamJson.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) {
        return json({ error: "Empty model response." }, 502, corsOrigin);
    }
    const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        return json({ error: "Model returned non-JSON output." }, 502, corsOrigin);
    }
    if (!isValidAnalysis(parsed)) {
        return json({ error: "Model returned malformed analysis." }, 502, corsOrigin);
    }
    const a = parsed as ParsedAnalysis;
    const result = {
        sentiment: a.sentiment,
        sentimentScore: clamp(a.sentimentScore, 0, 1),
        topics: a.topics
            .slice(0, 5)
            .map((t) => String(t).trim().toLowerCase())
            .filter(Boolean),
        suggestedPriority: a.suggestedPriority,
        summary: a.summary.slice(0, 240),
    };
    return json(result, 200, corsOrigin);
}

async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 200);
    } catch {
        return "";
    }
}

function isValidAnalysis(x: unknown): x is ParsedAnalysis {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
        (o.sentiment === "positive" || o.sentiment === "neutral" || o.sentiment === "negative") &&
        typeof o.sentimentScore === "number" &&
        Array.isArray(o.topics) &&
        o.topics.every((t) => typeof t === "string") &&
        (o.suggestedPriority === "low" ||
            o.suggestedPriority === "medium" ||
            o.suggestedPriority === "high" ||
            o.suggestedPriority === "critical") &&
        typeof o.summary === "string"
    );
}
// ─────────────────────────────────────────────────────────────────────
// /s — short-link service
//
// KV key shape:
//   `s:<code>` -> JSON { target, owner, createdAt, expiresAt? }
//
// auth: POST/DELETE require a Sui personal-message signature whose
// recovered address matches `body.address`. The signed message embeds
// the action, code, target, nonce, and timestamp so a captured
// signature cannot be replayed against a different request.
// ─────────────────────────────────────────────────────────────────────

const SHORT_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i
const SHORT_CODE_LENGTH = 5;
const CUSTOM_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(["s", "f", "api", "admin", "new", "info", "share", "scrolls"]);
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000; // 5 min replay window

interface ShortLinkRecord {
    target: string;
    owner: string;
    createdAt: number;
    expiresAt?: number;
}

interface ShortLinkCreateBody {
    slug?: string;
    target?: string;
    expiresInDays?: number;
    address?: string;
    signature?: string;
    message?: string;
}

async function handleShortLinkRedirect(code: string, env: Env): Promise<Response> {
    if (!isValidCode(code)) {
        return new Response("Invalid short code", { status: 404 });
    }
    const raw = await env.LINKS.get(`s:${code}`);
    if (!raw) {
        return new Response("Short link not found", { status: 404 });
    }
    let record: ShortLinkRecord;
    try {
        record = JSON.parse(raw) as ShortLinkRecord;
    } catch {
        return new Response("Short link corrupted", { status: 500 });
    }
    if (record.expiresAt && record.expiresAt < Date.now()) {
        return new Response("Short link expired", { status: 410 });
    }
    return Response.redirect(record.target, 302);
}

async function handleShortLinkInfo(
    code: string,
    env: Env,
    corsOrigin: string | null,
): Promise<Response> {
    if (!isValidCode(code)) {
        return json({ error: "Invalid code" }, 400, corsOrigin);
    }
    const raw = await env.LINKS.get(`s:${code}`);
    if (!raw) {
        return json({ error: "Not found" }, 404, corsOrigin);
    }
    const record = JSON.parse(raw) as ShortLinkRecord;
    return json(
        {
            code,
            target: record.target,
            owner: record.owner,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt ?? null,
        },
        200,
        corsOrigin,
    );
}

async function handleShortLinkCreate(
    request: Request,
    env: Env,
    corsOrigin: string,
): Promise<Response> {
    let body: ShortLinkCreateBody;
    try {
        body = (await request.json()) as ShortLinkCreateBody;
    } catch {
        return json({ error: "Invalid JSON body" }, 400, corsOrigin);
    }

    const target = typeof body.target === "string" ? body.target.trim() : "";
    if (!target) return json({ error: "target required" }, 400, corsOrigin);
    if (!isAllowedTarget(target, env)) {
        return json({ error: "target host not allowed" }, 400, corsOrigin);
    }

    if (!body.address || !body.signature || !body.message) {
        return json({ error: "address, signature, message required" }, 400, corsOrigin);
    }
    const sigCheck = await verifySig(body.message, body.signature, body.address);
    if (!sigCheck.ok) {
        return json({ error: sigCheck.error }, 401, corsOrigin);
    }

    // Bind the signed message to the actual request to prevent replay.
    const expectedFields = parseSignedFields(body.message);
    if (expectedFields.action !== "create" || expectedFields.target !== target) {
        return json({ error: "Signed message does not match request" }, 400, corsOrigin);
    }
    if (
        body.slug !== undefined &&
        body.slug.trim() !== "" &&
        expectedFields.slug !== body.slug.trim().toLowerCase()
    ) {
        return json({ error: "Signed slug does not match request" }, 400, corsOrigin);
    }

    let code: string;
    const requestedSlug = body.slug?.trim().toLowerCase();
    if (requestedSlug) {
        if (!CUSTOM_SLUG_RE.test(requestedSlug)) {
            return json(
                { error: "Slug must be 3–40 chars, a–z, 0–9, hyphen; cannot start/end with hyphen" },
                400,
                corsOrigin,
            );
        }
        if (RESERVED_SLUGS.has(requestedSlug)) {
            return json({ error: "That slug is reserved" }, 409, corsOrigin);
        }
        const existing = await env.LINKS.get(`s:${requestedSlug}`);
        if (existing) {
            const rec = JSON.parse(existing) as ShortLinkRecord;
            if (rec.owner !== body.address) {
                return json({ error: "Slug already taken" }, 409, corsOrigin);
            }
            // Owner re-claiming their own slug: fall through and overwrite.
        }
        code = requestedSlug;
    } else {
        // Random code, retry on collision up to 5 times.
        let candidate = "";
        for (let i = 0; i < 5; i++) {
            candidate = generateRandomCode();
            const existing = await env.LINKS.get(`s:${candidate}`);
            if (!existing) break;
            candidate = "";
        }
        if (!candidate) {
            return json({ error: "Could not allocate a code, try again" }, 503, corsOrigin);
        }
        code = candidate;
    }

    const expiresInDays = typeof body.expiresInDays === "number" ? body.expiresInDays : undefined;
    const now = Date.now();
    const expiresAt =
        expiresInDays && expiresInDays > 0
            ? now + Math.min(expiresInDays, 365) * 24 * 60 * 60 * 1000
            : undefined;

    const record: ShortLinkRecord = {
        target,
        owner: body.address,
        createdAt: now,
        ...(expiresAt ? { expiresAt } : {}),
    };
    await env.LINKS.put(`s:${code}`, JSON.stringify(record), {
        ...(expiresAt ? { expirationTtl: Math.ceil((expiresAt - now) / 1000) } : {}),
    });

    return json({ code, target, expiresAt: expiresAt ?? null }, 200, corsOrigin);
}

async function handleShortLinkDelete(
    request: Request,
    code: string,
    env: Env,
    corsOrigin: string,
): Promise<Response> {
    if (!isValidCode(code)) {
        return json({ error: "Invalid code" }, 400, corsOrigin);
    }
    let body: { address?: string; signature?: string; message?: string };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return json({ error: "Invalid JSON body" }, 400, corsOrigin);
    }
    if (!body.address || !body.signature || !body.message) {
        return json({ error: "address, signature, message required" }, 400, corsOrigin);
    }
    const sigCheck = await verifySig(body.message, body.signature, body.address);
    if (!sigCheck.ok) {
        return json({ error: sigCheck.error }, 401, corsOrigin);
    }
    const expectedFields = parseSignedFields(body.message);
    if (expectedFields.action !== "delete" || expectedFields.code !== code) {
        return json({ error: "Signed message does not match request" }, 400, corsOrigin);
    }
    const raw = await env.LINKS.get(`s:${code}`);
    if (!raw) return json({ ok: true }, 200, corsOrigin);
    const record = JSON.parse(raw) as ShortLinkRecord;
    if (record.owner !== body.address) {
        return json({ error: "Not the owner" }, 403, corsOrigin);
    }
    await env.LINKS.delete(`s:${code}`);
    return json({ ok: true }, 200, corsOrigin);
}

// ─────────────────────────────────────────────────────────────────────
// Short-link helpers
// ─────────────────────────────────────────────────────────────────────

function isValidCode(code: string): boolean {
    if (!code) return false;
    if (code.length < 3 || code.length > 40) return false;
    return CUSTOM_SLUG_RE.test(code);
}

function generateRandomCode(): string {
    const bytes = new Uint8Array(SHORT_CODE_LENGTH);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
        out += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
    }
    return out;
}

function isAllowedTarget(target: string, env: Env): boolean {
    let parsed: URL;
    try {
        parsed = new URL(target);
    } catch {
        return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const allowList = (env.SHORT_LINK_ALLOWED_TARGETS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    if (allowList.length === 0) {
        // Default policy: allow only Scrolls hosts. Tighter than nothing.
        const host = parsed.hostname.toLowerCase();
        return (
            host === "scrolls.fun" ||
            host.endsWith(".scrolls.fun") ||
            host.endsWith(".wal.app") ||
            host === "localhost" ||
            host === "127.0.0.1"
        );
    }
    return allowList.some((h) => parsed.hostname.toLowerCase() === h || parsed.hostname.toLowerCase().endsWith("." + h));
}

interface SigCheck {
    ok: boolean;
    error?: string;
}

async function verifySig(
    message: string,
    signature: string,
    expectedAddress: string,
): Promise<SigCheck> {
    // Replay window: signed messages embed an `Issued: <iso>` line.
    const fields = parseSignedFields(message);
    if (!fields.issuedAt) {
        return { ok: false, error: "Signed message missing Issued timestamp" };
    }
    const ageMs = Date.now() - fields.issuedAt;
    if (Number.isNaN(ageMs) || ageMs < -60_000 || ageMs > SIGNATURE_MAX_AGE_MS) {
        return { ok: false, error: "Signed message expired or clock skewed" };
    }
    try {
        const publicKey = await verifyPersonalMessageSignature(
            new TextEncoder().encode(message),
            signature,
        );
        const recoveredAddress = publicKey.toSuiAddress();
        if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
            return { ok: false, error: "Signature does not match address" };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: `Signature verification failed: ${(err as Error).message}` };
    }
}

interface SignedFields {
    action?: string;
    code?: string;
    slug?: string;
    target?: string;
    issuedAt?: number;
}

function parseSignedFields(message: string): SignedFields {
    const out: SignedFields = {};
    for (const line of message.split("\n")) {
        const idx = line.indexOf(":");
        if (idx < 0) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (key === "action") out.action = value.toLowerCase();
        else if (key === "code") out.code = value.toLowerCase();
        else if (key === "slug") out.slug = value.toLowerCase();
        else if (key === "target") out.target = value;
        else if (key === "issued") {
            const t = Date.parse(value);
            if (!Number.isNaN(t)) out.issuedAt = t;
        }
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────
// Submission relay
//
// Wallet-less respondents upload their submission JSON directly to
// Walrus (no auth needed for the public publisher), then POST the
// resulting blob id + the form's on-chain pointer id here. The worker
// signs `submission_ref::record(pointerId, blobIdBytes, clock)` using
// a dedicated hot keypair so the owner's dashboard can discover the
// submission via the standard `SubmissionRecorded` event.
//
// The relay never sees the submission contents. It only ever sees:
//   { pointerId, blobId }
// — both are pseudonymous identifiers already public on Walrus.
//
// Hardening:
//   • CORS origin allow-list (shared with other routes)
//   • Per-IP rate limit (shared bucket)
//   • Strict input shape + length checks
//   • pointerId must look like a Sui object id (0x + 1..64 hex)
//   • blobId capped at 256 chars (Walrus base64url ids are ~44)
// ─────────────────────────────────────────────────────────────────────

const SUI_MAINNET_RPC = "https://fullnode.mainnet.sui.io:443";

let _relayKeypair: Ed25519Keypair | null = null;
function getRelayKeypair(env: Env): Ed25519Keypair {
    if (_relayKeypair) return _relayKeypair;
    if (!env.RELAY_PRIVATE_KEY) {
        throw new Error("RELAY_PRIVATE_KEY secret not configured");
    }
    _relayKeypair = Ed25519Keypair.fromSecretKey(env.RELAY_PRIVATE_KEY);
    return _relayKeypair;
}

let _suiClient: SuiJsonRpcClient | null = null;
function getSuiClient(): SuiJsonRpcClient {
    if (!_suiClient) {
        _suiClient = new SuiJsonRpcClient({ url: SUI_MAINNET_RPC, network: "mainnet" });
    }
    return _suiClient;
}

interface RecordRequest {
    pointerId?: unknown;
    blobId?: unknown;
}

// In-memory mutex for the relay's `signAndExecute` calls. Two concurrent
// submissions from different respondents would otherwise both try to lock
// the same gas coin owned by the single relay keypair and the second one
// would fail with an equivocation / object-version error. Serializing per
// isolate prevents that. (Cloudflare may spin up multiple isolates, in
// which case the kept-warm one usually serves most traffic — the failure
// mode under cross-isolate races is the same equivocation that's already
// being caught + surfaced below.)
let _relayChain: Promise<unknown> = Promise.resolve();
function queueRelay<T>(fn: () => Promise<T>): Promise<T> {
    const next = _relayChain.then(fn, fn);
    // Swallow errors on the chain itself so one failure doesn't poison
    // every subsequent caller; each `next` still rejects with the real
    // error to its own caller.
    _relayChain = next.catch(() => undefined);
    return next;
}

async function handleRecordSubmission(
    request: Request,
    env: Env,
    corsOrigin: string,
): Promise<Response> {
    const pkg = env.SCROLLS_PACKAGE_MAINNET;
    if (!pkg) {
        return json(
            { error: "SCROLLS_PACKAGE_MAINNET is not configured." },
            501,
            corsOrigin,
        );
    }
    if (!env.RELAY_PRIVATE_KEY) {
        return json(
            { error: "Submission relay is not configured." },
            501,
            corsOrigin,
        );
    }

    const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
    if (contentLength > 4096) {
        return json({ error: "Request body too large." }, 413, corsOrigin);
    }

    let body: RecordRequest;
    try {
        body = (await request.json()) as RecordRequest;
    } catch {
        return json({ error: "Invalid JSON body" }, 400, corsOrigin);
    }

    const pointerId = typeof body.pointerId === "string" ? body.pointerId.trim() : "";
    const blobId = typeof body.blobId === "string" ? body.blobId.trim() : "";

    if (!/^0x[0-9a-fA-F]{1,64}$/.test(pointerId)) {
        return json({ error: "pointerId must be a 0x-prefixed Sui object id" }, 400, corsOrigin);
    }
    if (!blobId || blobId.length > 256 || !/^[A-Za-z0-9_\-]+$/.test(blobId)) {
        return json({ error: "blobId must be a Walrus blob id (base64url, <=256 chars)" }, 400, corsOrigin);
    }

    try {
        const keypair = getRelayKeypair(env);
        const client = getSuiClient();
        // Serialize relay sign+execute so concurrent submissions don't
        // equivocate on the relay's single gas coin.
        const res = await queueRelay(async () => {
            const tx = new Transaction();
            tx.moveCall({
                target: `${pkg}::submission_ref::record`,
                arguments: [
                    tx.object(pointerId),
                    tx.pure.vector("u8", Array.from(new TextEncoder().encode(blobId))),
                    tx.object("0x6"),
                ],
            });
            // Try once; on a transient gas/version conflict, refetch the
            // latest reference set and retry exactly once.
            try {
                return await client.signAndExecuteTransaction({
                    signer: keypair,
                    transaction: tx,
                    options: { showEffects: true },
                });
            } catch (innerErr) {
                const m = innerErr instanceof Error ? innerErr.message : String(innerErr);
                const transient = /equivocat|ObjectVersionUnavailable|reservation|locked|conflict/i.test(m);
                if (!transient) throw innerErr;
                const tx2 = new Transaction();
                tx2.moveCall({
                    target: `${pkg}::submission_ref::record`,
                    arguments: [
                        tx2.object(pointerId),
                        tx2.pure.vector("u8", Array.from(new TextEncoder().encode(blobId))),
                        tx2.object("0x6"),
                    ],
                });
                return await client.signAndExecuteTransaction({
                    signer: keypair,
                    transaction: tx2,
                    options: { showEffects: true },
                });
            }
        });
        const status = res.effects?.status?.status;
        if (status !== "success") {
            const err = res.effects?.status?.error ?? "unknown failure";
            return json({ error: `On-chain record failed: ${err}` }, 502, corsOrigin);
        }
        return json({ digest: res.digest, sponsoredBy: keypair.getPublicKey().toSuiAddress() }, 200, corsOrigin);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ error: `Relay error: ${msg}` }, 500, corsOrigin);
    }
}
