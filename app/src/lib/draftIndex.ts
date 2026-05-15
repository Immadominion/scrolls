// ─────────────────────────────────────────────────
// Draft Index (local-only, pre-publish)
//
// Stores in-progress builder states in localStorage so users can
// resume from the dashboard without losing work. Drafts are ALWAYS
// keyed under the anonymous bucket — the wallet address is only
// associated after publishing. On publish, the draft is deleted.
//
// Storage key: scrolls:drafts:anonymous
// ─────────────────────────────────────────────────

import type { FormConfig } from "@/types";

const STORAGE_KEY = "scrolls:drafts:anonymous";

export interface DraftEntry {
    /** Local UUID — NOT a Walrus blob ID */
    draftId: string;
    title: string;
    fieldCount: number;
    isPrivate: boolean;
    updatedAt: string; // ISO
    formConfig: FormConfig;
}

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function listDrafts(): DraftEntry[] {
    if (!isBrowser()) return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as DraftEntry[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
        return [];
    }
}

export function saveDraft(entry: DraftEntry): void {
    if (!isBrowser()) return;
    const current = listDrafts();
    const filtered = current.filter((d) => d.draftId !== entry.draftId);
    const next = [entry, ...filtered];
    // Cap at 20 drafts to avoid unbounded localStorage growth
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
}

export function getDraft(draftId: string): DraftEntry | null {
    if (!isBrowser()) return null;
    return listDrafts().find((d) => d.draftId === draftId) ?? null;
}

export function removeDraft(draftId: string): void {
    if (!isBrowser()) return;
    const filtered = listDrafts().filter((d) => d.draftId !== draftId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
