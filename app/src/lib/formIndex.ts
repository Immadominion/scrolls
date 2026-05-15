// ─────────────────────────────────────────────────
// Form Index (per-wallet, local-first)
//
// The MVP doesn't yet ship the Move contract that would let any browser
// discover the forms a wallet has published. Until then, we maintain a
// per-wallet index of {formBlobId, title, createdAt} entries in
// localStorage. Cross-device sync is documented as a future phase.
//
// Storage key: scrolls:forms:<walletAddress>
// Anonymous (no wallet connected): scrolls:forms:anonymous
//
// All operations are synchronous (localStorage). Safe to call from any
// client component. SSR-safe via `typeof window` guard.
// ─────────────────────────────────────────────────

const KEY_PREFIX = "scrolls:forms:";
const ANONYMOUS_KEY = "anonymous";

export interface FormIndexEntry {
    /** Walrus blob ID — also serves as the form's public ID and URL slug */
    formId: string;
    title: string;
    /** ISO timestamp */
    createdAt: string;
    /** Number of fields, for quick display */
    fieldCount: number;
    /** Whether the form's responses are end-to-end encrypted */
    isPrivate: boolean;
}

function storageKey(ownerAddress: string | null | undefined): string {
    return `${KEY_PREFIX}${ownerAddress ?? ANONYMOUS_KEY}`;
}

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * Read the full index for a wallet (or anonymous if no address).
 * Returns newest-first.
 */
export function listForms(ownerAddress: string | null | undefined): FormIndexEntry[] {
    if (!isBrowser()) return [];
    try {
        const raw = localStorage.getItem(storageKey(ownerAddress));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as FormIndexEntry[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
        return [];
    }
}

/**
 * Append a form to a wallet's index. Idempotent on formId.
 */
export function addForm(
    ownerAddress: string | null | undefined,
    entry: FormIndexEntry,
): void {
    if (!isBrowser()) return;
    const current = listForms(ownerAddress);
    const filtered = current.filter((e) => e.formId !== entry.formId);
    const next = [entry, ...filtered];
    localStorage.setItem(storageKey(ownerAddress), JSON.stringify(next));
}

/**
 * Remove a form from a wallet's index. Does NOT delete the Walrus blob
 * (Walrus storage is permanent — that's the point).
 */
export function removeForm(
    ownerAddress: string | null | undefined,
    formId: string,
): void {
    if (!isBrowser()) return;
    const next = listForms(ownerAddress).filter((e) => e.formId !== formId);
    localStorage.setItem(storageKey(ownerAddress), JSON.stringify(next));
}

/**
 * If a user connects a wallet AFTER publishing forms anonymously, migrate
 * those entries into the wallet-keyed index.
 */
export function adoptAnonymousForms(ownerAddress: string): void {
    if (!isBrowser()) return;
    if (!ownerAddress) return;
    const anon = listForms(null);
    if (anon.length === 0) return;
    const owned = listForms(ownerAddress);
    const seen = new Set(owned.map((e) => e.formId));
    const merged = [...owned, ...anon.filter((e) => !seen.has(e.formId))];
    localStorage.setItem(storageKey(ownerAddress), JSON.stringify(merged));
    localStorage.removeItem(storageKey(null));
}
