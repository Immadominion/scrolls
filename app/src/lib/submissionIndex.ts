// ─────────────────────────────────────────────────
// Submission Index (per-form, local-first)
//
// Stores submission blob IDs that the form OWNER has received. Until the
// Move contract phase ships, cross-browser submission discovery is not
// possible — submissions made on someone else's device won't appear in
// the owner's dashboard.
//
// Storage key: scrolls:submissions:<formId>
// ─────────────────────────────────────────────────

const KEY_PREFIX = "scrolls:submissions:";

export interface SubmissionIndexEntry {
    /** Walrus blob ID for the submission JSON */
    submissionBlobId: string;
    /** ISO timestamp */
    submittedAt: string;
    /** Sui address if submitter was authenticated, else null */
    submitterAddress: string | null;
    /** Whether the submission body is end-to-end encrypted */
    isEncrypted: boolean;
    /** True iff the submission JSON contains a wallet signature block. */
    isSigned?: boolean;
}

function storageKey(formId: string): string {
    return `${KEY_PREFIX}${formId}`;
}

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function listSubmissions(formId: string): SubmissionIndexEntry[] {
    if (!isBrowser()) return [];
    try {
        const raw = localStorage.getItem(storageKey(formId));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as SubmissionIndexEntry[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .slice()
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    } catch {
        return [];
    }
}

export function addSubmission(formId: string, entry: SubmissionIndexEntry): void {
    if (!isBrowser()) return;
    const current = listSubmissions(formId);
    const filtered = current.filter(
        (e) => e.submissionBlobId !== entry.submissionBlobId,
    );
    const next = [entry, ...filtered];
    localStorage.setItem(storageKey(formId), JSON.stringify(next));
}
