// ─────────────────────────────────────────────────
// Inbox review state
//
// Separate from admin metadata so we can keep `adminMetadata.ts`
// stable and reuse it unchanged in the per-form responses viewer.
// Review state tracks lightweight workflow flags used only by the
// cross-form inbox: unread/read/archive.
// ─────────────────────────────────────────────────

export type InboxReviewStatus = "unread" | "read" | "archived";

export interface InboxReviewState {
    status: InboxReviewStatus;
    updatedAt: string;
}

const PREFIX = "scrolls:inbox-review:";

function key(formId: string, submissionBlobId: string): string {
    return `${PREFIX}${formId}:${submissionBlobId}`;
}

function fallback(): InboxReviewState {
    return {
        status: "unread",
        updatedAt: new Date(0).toISOString(),
    };
}

export function loadInboxReviewState(
    formId: string,
    submissionBlobId: string,
): InboxReviewState {
    if (typeof localStorage === "undefined") return fallback();
    const raw = localStorage.getItem(key(formId, submissionBlobId));
    if (!raw) return fallback();
    try {
        return JSON.parse(raw) as InboxReviewState;
    } catch {
        return fallback();
    }
}

export function saveInboxReviewState(
    formId: string,
    submissionBlobId: string,
    status: InboxReviewStatus,
): InboxReviewState {
    const state: InboxReviewState = {
        status,
        updatedAt: new Date().toISOString(),
    };
    if (typeof localStorage !== "undefined") {
        localStorage.setItem(key(formId, submissionBlobId), JSON.stringify(state));
    }
    return state;
}
