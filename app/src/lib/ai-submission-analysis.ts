// ─────────────────────────────────────────────────────────────────────
// AI submission analysis (sentiment, topics, suggested priority).
//
// Sends a redacted, text-only summary of a single submission to Claude
// Haiku via the AI proxy and persists the structured response in
// localStorage so repeat visits are free.
//
// Privacy: this runs client-side from the form OWNER's browser. Encrypted
// submissions are decrypted locally first; only the resulting plaintext
// (already in the owner's hands) is forwarded to the proxy. Anonymous
// submissions stay anonymous — we never include the submitter address.
// ─────────────────────────────────────────────────────────────────────

import type { AIAnalysis, FormConfig, Submission } from "@/types";
import { richTextToPlainText } from "@/lib/richText";

const PROXY_URL =
    process.env.NEXT_PUBLIC_AI_PROXY_URL ??
    process.env.NEXT_PUBLIC_CLAUDE_PROXY_URL ??
    "";

const STORAGE_PREFIX = "scrolls:ai-analysis:";

interface ParsedAnalysis {
    sentiment: "positive" | "neutral" | "negative";
    sentimentScore: number;
    topics: string[];
    suggestedPriority: "low" | "medium" | "high" | "critical";
    summary: string;
}

/** Build a readable, label-keyed transcript of a submission. */
function renderSubmissionForAI(submission: Submission, formConfig: FormConfig): string {
    const fieldMap = new Map(formConfig.fields.map((f) => [f.id, f]));
    const lines: string[] = [];
    lines.push(`Form: ${formConfig.title}`);
    if (formConfig.description) lines.push(`Description: ${formConfig.description}`);
    lines.push("");
    for (const r of submission.responses) {
        const field = fieldMap.get(r.fieldId);
        const label = field?.label ?? r.fieldId;
        const value = r.value;
        let rendered: string;
        if (value === null || value === undefined || value === "") rendered = "(blank)";
        else if (Array.isArray(value)) rendered = value.length ? value.join(", ") : "(blank)";
        else if (typeof value === "boolean") rendered = value ? "Yes" : "No";
        else if (typeof value === "number") rendered = String(value);
        else if (typeof value === "string") {
            // Rich-text fields ship as HTML — strip tags before sending
            // to the model so the prompt stays compact and unambiguous.
            rendered = field?.type === "rich_text"
                ? richTextToPlainText(value) || "(blank)"
                : value;
        }
        else rendered = `[file: ${value.filename ?? value.blobId} (${value.mimeType})]`;
        lines.push(`${label}: ${rendered}`);
    }
    return lines.join("\n");
}

export function loadCachedAnalysis(submissionBlobId: string): AIAnalysis | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_PREFIX + submissionBlobId);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AIAnalysis;
    } catch {
        return null;
    }
}

export function clearCachedAnalysis(submissionBlobId: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_PREFIX + submissionBlobId);
}

function saveCachedAnalysis(submissionBlobId: string, analysis: AIAnalysis): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_PREFIX + submissionBlobId, JSON.stringify(analysis));
}

/**
 * Run analysis for a single submission and cache the result.
 * Throws if the proxy is unreachable or returns malformed JSON.
 */
export async function analyzeSubmission(
    submission: Submission,
    formConfig: FormConfig,
    submissionBlobId: string,
): Promise<AIAnalysis> {
    if (!PROXY_URL) {
        throw new Error(
            "AI proxy URL is not configured. Set NEXT_PUBLIC_AI_PROXY_URL to enable analysis.",
        );
    }

    const userText = renderSubmissionForAI(submission, formConfig);

    // The proxy's /analyze route pins the system prompt + JSON shape
    // server-side; we just hand it the rendered transcript. Falls back
    // to the generic Messages route only if the proxy is older.
    const analyzeUrl = PROXY_URL.replace(/\/+$/, "") + "/analyze";
    const res = await fetch(analyzeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            transcript: userText,
            formTitle: formConfig.title,
            formDescription: formConfig.description ?? "",
        }),
    });

    if (!res.ok) {
        const detail = await safeText(res);
        throw new Error(`AI proxy error ${res.status}: ${detail || res.statusText}`);
    }

    const parsed = (await res.json()) as ParsedAnalysis;
    if (!isValidAnalysis(parsed)) {
        throw new Error("AI proxy returned malformed analysis.");
    }

    const analysis: AIAnalysis = {
        submissionId: submission.id,
        sentiment: parsed.sentiment,
        sentimentScore: clamp01(parsed.sentimentScore),
        topics: parsed.topics.slice(0, 5).map((t) => t.toString().trim()).filter(Boolean),
        suggestedPriority: parsed.suggestedPriority,
        summary: parsed.summary.slice(0, 240),
        analyzedAt: new Date().toISOString(),
    };
    saveCachedAnalysis(submissionBlobId, analysis);
    return analysis;
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

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, n));
}

async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 200);
    } catch {
        return "";
    }
}

// ── Auto-analysis queue ─────────────────────────────────────────────
//
// Lets UI components (per-row AI panel, aggregate insights) fire
// `enqueueAnalysis(...)` without coordinating with each other. Runs at
// most MAX_CONCURRENT analyses in parallel and dedupes by blob ID so
// React re-renders don't burst the proxy. Listeners can subscribe to
// know when any analysis completes (for the aggregate panel to refresh).

const MAX_CONCURRENT = 2;
const inFlight = new Set<string>();
const queued: Array<() => Promise<void>> = [];
let runningCount = 0;
const completionListeners = new Set<(blobId: string, analysis: AIAnalysis | null) => void>();

function pump(): void {
    while (runningCount < MAX_CONCURRENT && queued.length > 0) {
        const job = queued.shift();
        if (!job) break;
        runningCount += 1;
        job().finally(() => {
            runningCount -= 1;
            pump();
        });
    }
}

export function isAIProxyConfigured(): boolean {
    return !!PROXY_URL;
}

/**
 * Schedule a background analysis for `submission`. Resolves with the
 * cached/computed analysis, or `null` if the proxy is unconfigured or
 * the upstream call failed. Safe to call repeatedly with the same blob
 * ID — duplicate calls return the cached result and never re-queue.
 */
export function enqueueAnalysis(
    submission: Submission,
    formConfig: FormConfig,
    submissionBlobId: string,
): Promise<AIAnalysis | null> {
    if (!PROXY_URL) return Promise.resolve(null);
    const cached = loadCachedAnalysis(submissionBlobId);
    if (cached) return Promise.resolve(cached);
    if (inFlight.has(submissionBlobId)) {
        return Promise.resolve(loadCachedAnalysis(submissionBlobId));
    }
    inFlight.add(submissionBlobId);

    return new Promise<AIAnalysis | null>((resolve) => {
        queued.push(async () => {
            let result: AIAnalysis | null = null;
            try {
                // Re-check the cache: a parallel manual run (e.g. the
                // per-row "Re-run" button) may have populated it while
                // we were waiting in the queue.
                const fresh = loadCachedAnalysis(submissionBlobId);
                if (fresh) {
                    result = fresh;
                } else {
                    result = await analyzeSubmission(submission, formConfig, submissionBlobId);
                }
            } catch {
                result = null;
            } finally {
                inFlight.delete(submissionBlobId);
                for (const l of completionListeners) {
                    try { l(submissionBlobId, result); } catch { /* swallow */ }
                }
                resolve(result);
            }
        });
        pump();
    });
}

/** Subscribe to background-analysis completions. Returns an unsubscribe fn. */
export function subscribeAnalysisCompletions(
    listener: (blobId: string, analysis: AIAnalysis | null) => void,
): () => void {
    completionListeners.add(listener);
    return () => {
        completionListeners.delete(listener);
    };
}
