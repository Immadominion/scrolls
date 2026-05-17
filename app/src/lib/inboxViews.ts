// ─────────────────────────────────────────────────
// Saved inbox views
//
// A view is a serialised filter + sort + column-visibility set that the
// owner can recall with one click ("Critical bugs", "Last 7 days", …).
//
// Storage:
//   scrolls:inbox-views:<wallet|anon>  →  SavedView[]   (primary, instant)
//
// `backupViewsToWalrus()` uploads the current view set as a permanent
// JSON blob and returns its blob id. Pasting that id into
// `restoreViewsFromWalrus(blobId)` on another device hydrates the local
// list. Walrus' content-addressed certification IS the cross-device
// receipt — no backend, no extra Sui object required.
// ─────────────────────────────────────────────────

import { uploadJSON, fetchJSON } from "@/lib/walrus";

export type PriorityFilter = "all" | "low" | "medium" | "high" | "critical";
export type StatusFilter = "all" | "unread" | "read" | "archived";
export type EncryptionFilter = "all" | "public" | "encrypted" | "locked";
export type SortKey = "newest" | "oldest" | "priority" | "sentiment";

export interface SavedView {
    /** Stable id (uuid). */
    id: string;
    name: string;
    /** Optional emoji or icon name. */
    icon?: string;
    filters: {
        formIds: string[];        // [] = all forms
        priority: PriorityFilter;
        status: StatusFilter;
        encryption: EncryptionFilter;
        tags: string[];           // OR semantics
        search: string;
        sinceDays: number | null; // e.g. 7 = last 7 days
    };
    sort: SortKey;
    createdAt: string;
    updatedAt: string;
}

export const DEFAULT_FILTERS: SavedView["filters"] = {
    formIds: [],
    priority: "all",
    status: "all",
    encryption: "all",
    tags: [],
    search: "",
    sinceDays: null,
};

const PREFIX = "scrolls:inbox-views:";
const LAST_BACKUP_PREFIX = "scrolls:inbox-views-backup:";
const ANON = "anonymous";

function key(addr: string | null | undefined): string {
    return PREFIX + (addr ?? ANON);
}

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function listViews(addr: string | null | undefined): SavedView[] {
    if (!isBrowser()) return [];
    try {
        const raw = localStorage.getItem(key(addr));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as SavedView[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function writeViews(addr: string | null | undefined, views: SavedView[]): void {
    if (!isBrowser()) return;
    localStorage.setItem(key(addr), JSON.stringify(views));
}

export function upsertView(addr: string | null | undefined, view: SavedView): SavedView[] {
    const next = listViews(addr).filter((v) => v.id !== view.id);
    next.unshift(view);
    writeViews(addr, next);
    return next;
}

export function deleteView(addr: string | null | undefined, id: string): SavedView[] {
    const next = listViews(addr).filter((v) => v.id !== id);
    writeViews(addr, next);
    return next;
}

export function newView(name: string, partial: Partial<SavedView> = {}): SavedView {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        name,
        filters: { ...DEFAULT_FILTERS, ...(partial.filters ?? {}) },
        sort: partial.sort ?? "newest",
        icon: partial.icon,
        createdAt: now,
        updatedAt: now,
    };
}

/** Upload current views to Walrus and remember the blob id locally. */
export async function backupViewsToWalrus(
    addr: string | null | undefined,
): Promise<{ blobId: string; backedUpAt: string; count: number }> {
    const views = listViews(addr);
    const payload = {
        kind: "scrolls.inbox-views.v1",
        owner: addr ?? null,
        backedUpAt: new Date().toISOString(),
        views,
    };
    const blobId = await uploadJSON(payload);
    const meta = { blobId, backedUpAt: payload.backedUpAt, count: views.length };
    if (isBrowser()) localStorage.setItem(LAST_BACKUP_PREFIX + (addr ?? ANON), JSON.stringify(meta));
    return meta;
}

export function lastBackupMeta(
    addr: string | null | undefined,
): { blobId: string; backedUpAt: string; count: number } | null {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(LAST_BACKUP_PREFIX + (addr ?? ANON));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as { blobId: string; backedUpAt: string; count: number };
    } catch {
        return null;
    }
}

/**
 * Pull a previously-uploaded views blob and merge into local list.
 * Existing local views with the same id are overwritten. Returns the
 * new full list.
 */
export async function restoreViewsFromWalrus(
    addr: string | null | undefined,
    blobId: string,
): Promise<SavedView[]> {
    const payload = await fetchJSON<{ views?: SavedView[] }>(blobId);
    const incoming = Array.isArray(payload.views) ? payload.views : [];
    const existing = listViews(addr);
    const byId = new Map(existing.map((v) => [v.id, v]));
    for (const v of incoming) byId.set(v.id, v);
    const merged = Array.from(byId.values()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
    );
    writeViews(addr, merged);
    return merged;
}
