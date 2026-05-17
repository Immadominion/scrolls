// ─────────────────────────────────────────────────
// Submission body cache
//
// Walrus blob ids are content-addressed and immutable, so once a
// submission JSON has been fetched it never needs to be fetched again.
// We persist the parsed body (or the encrypted-envelope marker) keyed
// by blob id so the cross-form inbox view paints instantly on repeat
// visits instead of waiting 1–3 s per blob.
//
// Layout:
//   scrolls:sub-cache:<blobId>  →  CachedSubmission JSON
//
// `kind` separates "we have plaintext" (encrypted=false, or encrypted
// then decrypted on a previous visit and we cached the plaintext) from
// "envelope only" (still locked on this device). Inbox callers decide
// what to render based on `kind`.
// ─────────────────────────────────────────────────

import type { Submission } from "@/types";

export type CachedSubmission =
    | {
        kind: "plain";
        submission: Submission;
        /** True if the source blob was an encrypted envelope we successfully
         *  decrypted on a previous visit. Lets the UI keep the "encrypted"
         *  badge while still showing the answers. */
        wasEncrypted?: boolean;
        cachedAt: string;
    }
    | {
        kind: "encrypted";
        envelopeVersion: "v1" | "v2";
        cachedAt: string;
    };

const PREFIX = "scrolls:sub-cache:";

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadCachedSubmission(blobId: string): CachedSubmission | null {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(PREFIX + blobId);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as CachedSubmission;
    } catch {
        return null;
    }
}

export function saveCachedSubmission(blobId: string, entry: CachedSubmission): void {
    if (!isBrowser()) return;
    try {
        localStorage.setItem(PREFIX + blobId, JSON.stringify(entry));
    } catch {
        // localStorage quota — evict oldest entries and retry once.
        evictOldestPortion();
        try {
            localStorage.setItem(PREFIX + blobId, JSON.stringify(entry));
        } catch {
            /* give up silently — cache is best-effort */
        }
    }
}

export function hasCachedSubmission(blobId: string): boolean {
    if (!isBrowser()) return false;
    return localStorage.getItem(PREFIX + blobId) !== null;
}

/** Evict the oldest 20% of entries by `cachedAt`. */
function evictOldestPortion(): void {
    if (!isBrowser()) return;
    const entries: Array<{ key: string; at: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(PREFIX)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw) as { cachedAt?: string };
            entries.push({ key: k, at: parsed.cachedAt ?? "" });
        } catch {
            entries.push({ key: k, at: "" });
        }
    }
    entries.sort((a, b) => a.at.localeCompare(b.at));
    const count = Math.max(1, Math.ceil(entries.length * 0.2));
    for (const e of entries.slice(0, count)) localStorage.removeItem(e.key);
}
