// ─────────────────────────────────────────────────────────────────────
// Scrolls — short-link client
//
// Talks to the AI proxy Worker (`NEXT_PUBLIC_CLAUDE_PROXY_URL`) which
// owns the `LINKS` KV namespace and verifies wallet signatures
// server-side. Public redirects live at `NEXT_PUBLIC_SHORT_LINK_BASE`
// (e.g. https://scrolls.fun) which fronts `Worker /s/<code>` via a
// Cloudflare Route.
//
// Auth: every create/delete call signs a domain-scoped personal message
// with the user's wallet. The Worker re-derives the address from the
// signature and refuses to mutate links it does not own.
// ─────────────────────────────────────────────────────────────────────

const PROXY_BASE = process.env.NEXT_PUBLIC_CLAUDE_PROXY_URL ?? "";
const SHORT_LINK_BASE =
    process.env.NEXT_PUBLIC_SHORT_LINK_BASE ??
    (typeof window !== "undefined" ? window.location.origin : "");

const SIGNED_PREFIX = "scrolls/short-link/v1";
const encoder = new TextEncoder();

// ── Validation ─────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

export function isValidCustomSlug(slug: string): boolean {
    return SLUG_RE.test(slug);
}

export function shortLinkUrl(code: string): string {
    const base = SHORT_LINK_BASE.replace(/\/$/, "");
    return `${base}/s/${code}`;
}

// ── Wallet signing ─────────────────────────────────────────────────────

interface SignPersonalMessageLike {
    signPersonalMessage: (args: { message: Uint8Array }) => Promise<{ signature: string }>;
}

interface SignedRequest {
    address: string;
    signature: string;
    message: string;
}

async function signCreate(
    dAppKit: SignPersonalMessageLike,
    address: string,
    target: string,
    slug: string | undefined,
): Promise<SignedRequest> {
    const issued = new Date().toISOString();
    const message =
        `${SIGNED_PREFIX}\n` +
        `Action: create\n` +
        (slug ? `Slug: ${slug}\n` : "") +
        `Target: ${target}\n` +
        `Issued: ${issued}\n`;
    const { signature } = await dAppKit.signPersonalMessage({
        message: encoder.encode(message),
    });
    return { address, signature, message };
}

async function signDelete(
    dAppKit: SignPersonalMessageLike,
    address: string,
    code: string,
): Promise<SignedRequest> {
    const issued = new Date().toISOString();
    const message =
        `${SIGNED_PREFIX}\n` +
        `Action: delete\n` +
        `Code: ${code}\n` +
        `Issued: ${issued}\n`;
    const { signature } = await dAppKit.signPersonalMessage({
        message: encoder.encode(message),
    });
    return { address, signature, message };
}

// ── Public API ─────────────────────────────────────────────────────────

export interface CreateShortLinkOptions {
    target: string;
    /** Custom slug. If omitted or already taken by another address, the
     *  Worker will fall back to an auto-generated 5-char code (when this
     *  function is called via {@link createShortLinkSmart}). */
    slug?: string;
    expiresInDays?: number;
}

export interface ShortLinkResult {
    code: string;
    url: string;
    target: string;
    expiresAt: number | null;
}

function ensureProxyConfigured() {
    if (!PROXY_BASE) {
        throw new Error(
            "Short links are not configured. Set NEXT_PUBLIC_CLAUDE_PROXY_URL to your worker URL.",
        );
    }
}

export async function createShortLink(
    dAppKit: SignPersonalMessageLike,
    address: string,
    opts: CreateShortLinkOptions,
): Promise<ShortLinkResult> {
    ensureProxyConfigured();
    const slug = opts.slug?.trim().toLowerCase() || undefined;
    if (slug && !isValidCustomSlug(slug)) {
        throw new Error(
            "Custom slug must be 3–40 chars, a–z, 0–9, hyphen; cannot start or end with hyphen.",
        );
    }
    const signed = await signCreate(dAppKit, address, opts.target, slug);
    const res = await fetch(new URL("/s", PROXY_BASE).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            slug,
            target: opts.target,
            expiresInDays: opts.expiresInDays,
            ...signed,
        }),
    });
    const json = (await res.json()) as { code?: string; expiresAt?: number | null; error?: string };
    if (!res.ok || !json.code) {
        const err = new Error(json.error ?? `Short link create failed (${res.status})`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
    }
    return {
        code: json.code,
        url: shortLinkUrl(json.code),
        target: opts.target,
        expiresAt: json.expiresAt ?? null,
    };
}

/**
 * Try the user's preferred slug first; if it's taken (409) by someone
 * else, transparently fall back to an auto-generated short code.
 */
export async function createShortLinkSmart(
    dAppKit: SignPersonalMessageLike,
    address: string,
    opts: CreateShortLinkOptions,
): Promise<ShortLinkResult & { fallbackUsed: boolean }> {
    if (opts.slug && opts.slug.trim() !== "") {
        try {
            const result = await createShortLink(dAppKit, address, opts);
            return { ...result, fallbackUsed: false };
        } catch (err) {
            const status = (err as Error & { status?: number }).status;
            if (status !== 409) throw err;
            // Slug taken: fall through and create a random one.
        }
    }
    const random = await createShortLink(dAppKit, address, {
        target: opts.target,
        expiresInDays: opts.expiresInDays,
    });
    return { ...random, fallbackUsed: !!opts.slug };
}

export async function deleteShortLink(
    dAppKit: SignPersonalMessageLike,
    address: string,
    code: string,
): Promise<void> {
    ensureProxyConfigured();
    const signed = await signDelete(dAppKit, address, code);
    const res = await fetch(new URL(`/s/${code}`, PROXY_BASE).toString(), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
    });
    if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Short link delete failed (${res.status})`);
    }
}

export interface ShortLinkInfo {
    code: string;
    target: string;
    owner: string;
    createdAt: number;
    expiresAt: number | null;
}

export async function getShortLinkInfo(code: string): Promise<ShortLinkInfo | null> {
    ensureProxyConfigured();
    const res = await fetch(new URL(`/s/${code}/info`, PROXY_BASE).toString());
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`Short link info failed (${res.status})`);
    }
    return (await res.json()) as ShortLinkInfo;
}
