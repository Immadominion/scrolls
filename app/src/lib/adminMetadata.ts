// ─────────────────────────────────────────────────────
// Admin metadata storage (localStorage, per-submission)
//
// Stores admin-only notes, priority, and tags per submission.
// This is intentionally local-only — never uploaded to Walrus.
// ─────────────────────────────────────────────────────

export interface AdminMetadata {
    notes: string;
    priority: "low" | "medium" | "high" | "critical";
    tags: string[];
    lastUpdated: string; // ISO timestamp
}

const PREFIX = "scrolls:admin:";

/**
 * Save admin metadata for a submission.
 */
export function saveAdminMetadata(
    formId: string,
    submissionBlobId: string,
    metadata: AdminMetadata,
): void {
    if (typeof localStorage === "undefined") return;
    const key = `${PREFIX}${formId}:${submissionBlobId}`;
    localStorage.setItem(key, JSON.stringify(metadata));
}

/**
 * Load admin metadata for a submission, or return defaults.
 */
export function loadAdminMetadata(
    formId: string,
    submissionBlobId: string,
): AdminMetadata {
    if (typeof localStorage === "undefined") {
        return getDefaultMetadata();
    }
    const key = `${PREFIX}${formId}:${submissionBlobId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return getDefaultMetadata();
    try {
        return JSON.parse(raw) as AdminMetadata;
    } catch {
        return getDefaultMetadata();
    }
}

/**
 * Delete admin metadata for a submission.
 */
export function deleteAdminMetadata(
    formId: string,
    submissionBlobId: string,
): void {
    if (typeof localStorage === "undefined") return;
    const key = `${PREFIX}${formId}:${submissionBlobId}`;
    localStorage.removeItem(key);
}

/**
 * List all admin metadata for a form.
 * Used for sorting and filtering.
 */
export function listAdminMetadataForForm(
    formId: string,
): Array<{ submissionBlobId: string; metadata: AdminMetadata }> {
    if (typeof localStorage === "undefined") return [];
    const formPrefix = `${PREFIX}${formId}:`;
    const result: Array<{ submissionBlobId: string; metadata: AdminMetadata }> = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(formPrefix)) continue;
        const submissionBlobId = key.slice(formPrefix.length);
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                result.push({
                    submissionBlobId,
                    metadata: JSON.parse(raw) as AdminMetadata,
                });
            }
        } catch {
            // Silently skip malformed entries
        }
    }
    return result;
}

function getDefaultMetadata(): AdminMetadata {
    return {
        notes: "",
        priority: "medium",
        tags: [],
        lastUpdated: new Date().toISOString(),
    };
}
