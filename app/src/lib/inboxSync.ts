// ─────────────────────────────────────────────────
// Inbox sync orchestrator
//
// Given a connected wallet, builds the cross-form submission inbox by:
//
//   1. Listing every form the wallet owns (local index + on-chain
//      `FormPublished` events).
//   2. For each form, walking local submission entries + on-chain
//      `SubmissionRecorded` events to assemble a deduplicated set of
//      submission blob ids.
//   3. Fetching each submission body from Walrus with bounded
//      concurrency, classifying it as plaintext or encrypted, and
//      writing the result to `submissionCache` so the next visit
//      paints instantly.
//   4. Enqueuing AI analysis for newly-seen plaintext rows (capped per
//      session to avoid runaway proxy spend).
//
// The sync emits progress events so the UI can show a thin top-bar.
// Cancellation is honoured between blob fetches.
// ─────────────────────────────────────────────────

import type { FormConfig, Submission } from "@/types";
import { fetchJSON } from "@/lib/walrus";
import {
    listForms,
    addForm,
} from "@/lib/formIndex";
import {
    listSubmissions,
    addSubmission,
    type SubmissionIndexEntry,
} from "@/lib/submissionIndex";
import {
    getMyForms,
    getSubmissionsForForm,
    isPointerId,
    getFormPointer,
} from "@/lib/registry";
import { hasOnchainRegistry } from "@/lib/contracts";
import {
    loadCachedSubmission,
    saveCachedSubmission,
    type CachedSubmission,
} from "@/lib/submissionCache";
import { isEncryptedEnvelope } from "@/lib/crypto";
import { isSealEnvelope } from "@/lib/seal";
import {
    enqueueAnalysis,
    isAIProxyConfigured,
    loadCachedAnalysis,
} from "@/lib/ai-submission-analysis";

// ── Public row shape ─────────────────────────────

export interface InboxRow {
    submissionBlobId: string;
    formId: string;
    formTitle: string;
    submittedAt: string;
    submitterAddress: string | null;
    /** Was the source blob encrypted? */
    isEncrypted: boolean;
    /** Do we have decrypted/plaintext answers for this row right now? */
    isReadable: boolean;
    /** Parsed submission (only present when isReadable). */
    submission: Submission | null;
    /** Encryption envelope version for locked rows. */
    envelopeVersion?: "v1" | "v2";
}

export interface InboxState {
    rows: InboxRow[];
    forms: Array<{ formId: string; title: string; config: FormConfig | null }>;
    /** Fetch progress: total = discovered blobs, fetched = cached. */
    progress: { total: number; fetched: number };
    isSyncing: boolean;
    lastSyncedAt: string | null;
    error: string | null;
}

export const EMPTY_INBOX: InboxState = {
    rows: [],
    forms: [],
    progress: { total: 0, fetched: 0 },
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
};

// ── Sync runner ─────────────────────────────────

const FETCH_CONCURRENCY = 5;
const AI_PER_SESSION_CAP = 50; // hard ceiling so the proxy bill stays sane
let aiSpentThisSession = 0;

interface SyncOptions {
    ownerAddress: string | null | undefined;
    /** Called with an updated snapshot after each blob lands. Cheap. */
    onProgress: (snapshot: InboxState) => void;
    /** Set to true to stop further fetches between blobs. */
    isCancelled: () => boolean;
    /** If true, enqueue AI analysis for unanalysed plaintext rows. */
    eagerAI?: boolean;
}

export async function runInboxSync(opts: SyncOptions): Promise<InboxState> {
    const { ownerAddress, onProgress, isCancelled } = opts;
    const eagerAI = opts.eagerAI ?? true;
    const ownerKey = ownerAddress ?? null;

    let state: InboxState = {
        ...EMPTY_INBOX,
        isSyncing: true,
    };
    const emit = (patch: Partial<InboxState>) => {
        state = { ...state, ...patch };
        onProgress(state);
    };

    try {
        // 1. Resolve form list (local + on-chain).
        const localForms = listForms(ownerKey);
        const knownIds = new Set(localForms.map((f) => f.formId));
        if (ownerAddress && hasOnchainRegistry()) {
            try {
                const onchain = await getMyForms(ownerAddress);
                for (const f of onchain) {
                    if (!knownIds.has(f.pointerId)) {
                        addForm(ownerKey, {
                            formId: f.pointerId,
                            title: "On-chain form",
                            createdAt: new Date(f.createdAtMs).toISOString(),
                            fieldCount: 0,
                            isPrivate: false,
                        });
                        knownIds.add(f.pointerId);
                    }
                }
            } catch {
                /* on-chain optional */
            }
        }
        const formEntries = listForms(ownerKey);

        // 2. Hydrate form configs (cached parallel). For pointer-id forms,
        //    resolve the latest blob via the on-chain pointer.
        const formsWithConfig = await Promise.all(
            formEntries.map(async (entry) => {
                try {
                    let blob = entry.formId;
                    if (isPointerId(entry.formId)) {
                        const ptr = await getFormPointer(entry.formId);
                        if (ptr) blob = ptr.blobId;
                    }
                    const cfg = await fetchJSON<FormConfig>(blob);
                    return { formId: entry.formId, title: cfg.title, config: cfg };
                } catch {
                    return { formId: entry.formId, title: entry.title, config: null };
                }
            }),
        );
        emit({ forms: formsWithConfig });

        // 3. For each form, merge local + on-chain submission lists.
        const allEntries: Array<{ formId: string; entry: SubmissionIndexEntry }> = [];
        for (const f of formsWithConfig) {
            const local = listSubmissions(f.formId);
            const seen = new Set(local.map((s) => s.submissionBlobId));
            if (hasOnchainRegistry() && isPointerId(f.formId)) {
                try {
                    const onchain = await getSubmissionsForForm(f.formId);
                    for (const sub of onchain) {
                        if (seen.has(sub.blobId)) continue;
                        const entry: SubmissionIndexEntry = {
                            submissionBlobId: sub.blobId,
                            submittedAt: new Date(sub.submittedAtMs).toISOString(),
                            submitterAddress: sub.submitter,
                            // Encryption flag isn't known from the event;
                            // we discover it when we parse the blob body
                            // below and rewrite the index entry then.
                            isEncrypted: false,
                            isSigned: false,
                        };
                        addSubmission(f.formId, entry);
                        seen.add(sub.blobId);
                    }
                } catch {
                    /* on-chain optional */
                }
            }
            for (const e of listSubmissions(f.formId)) {
                allEntries.push({ formId: f.formId, entry: e });
            }
        }

        // 4. Paint cached rows immediately, queue uncached blobs for fetch.
        const rowMap = new Map<string, InboxRow>();
        for (const { formId, entry } of allEntries) {
            const form = formsWithConfig.find((f) => f.formId === formId);
            const cached = loadCachedSubmission(entry.submissionBlobId);
            rowMap.set(entry.submissionBlobId, rowFromCache({
                formId,
                formTitle: form?.title ?? "Untitled form",
                entry,
                cached,
            }));
        }
        const initialRows = Array.from(rowMap.values()).sort(
            (a, b) => b.submittedAt.localeCompare(a.submittedAt),
        );
        const toFetch = allEntries.filter(
            (x) => !loadCachedSubmission(x.entry.submissionBlobId),
        );
        emit({
            rows: initialRows,
            progress: { total: allEntries.length, fetched: allEntries.length - toFetch.length },
        });

        // 5. Bounded-concurrency fetch loop.
        let cursor = 0;
        let fetchedSoFar = state.progress.fetched;
        const workers = Array.from({ length: FETCH_CONCURRENCY }, () =>
            (async () => {
                while (cursor < toFetch.length) {
                    if (isCancelled()) return;
                    const idx = cursor++;
                    const item = toFetch[idx];
                    if (!item) return;
                    try {
                        const raw = await fetchJSON<unknown>(item.entry.submissionBlobId);
                        const cacheEntry = classify(raw);
                        saveCachedSubmission(item.entry.submissionBlobId, cacheEntry);
                        const form = formsWithConfig.find((f) => f.formId === item.formId);
                        const row = rowFromCache({
                            formId: item.formId,
                            formTitle: form?.title ?? "Untitled form",
                            entry: item.entry,
                            cached: cacheEntry,
                        });
                        rowMap.set(item.entry.submissionBlobId, row);

                        // Eager AI on plaintext rows — capped per session.
                        if (
                            eagerAI &&
                            isAIProxyConfigured() &&
                            row.isReadable &&
                            row.submission &&
                            form?.config &&
                            !loadCachedAnalysis(row.submissionBlobId) &&
                            aiSpentThisSession < AI_PER_SESSION_CAP
                        ) {
                            aiSpentThisSession += 1;
                            void enqueueAnalysis(
                                row.submission,
                                form.config,
                                row.submissionBlobId,
                            );
                        }
                    } catch {
                        // Leave the row in its "loading" state; user can
                        // retry by re-syncing.
                    } finally {
                        fetchedSoFar += 1;
                        const merged = Array.from(rowMap.values()).sort(
                            (a, b) => b.submittedAt.localeCompare(a.submittedAt),
                        );
                        emit({
                            rows: merged,
                            progress: { total: allEntries.length, fetched: fetchedSoFar },
                        });
                    }
                }
            })(),
        );
        await Promise.all(workers);

        emit({
            isSyncing: false,
            lastSyncedAt: new Date().toISOString(),
            error: null,
        });
        return state;
    } catch (err) {
        emit({
            isSyncing: false,
            error: err instanceof Error ? err.message : "Sync failed",
        });
        return state;
    }
}

// ── Helpers ─────────────────────────────────────

function classify(raw: unknown): CachedSubmission {
    const now = new Date().toISOString();
    if (isSealEnvelope(raw)) {
        return { kind: "encrypted", envelopeVersion: "v2", cachedAt: now };
    }
    if (isEncryptedEnvelope(raw)) {
        return { kind: "encrypted", envelopeVersion: "v1", cachedAt: now };
    }
    if (isSubmissionShape(raw)) {
        return { kind: "plain", submission: raw, cachedAt: now };
    }
    // Unknown shape — store as plaintext with empty responses so we
    // don't keep re-fetching.
    return { kind: "plain", submission: emptySubmission(), cachedAt: now };
}

function isSubmissionShape(x: unknown): x is Submission {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
        typeof o.id === "string" &&
        typeof o.formId === "string" &&
        Array.isArray(o.responses)
    );
}

function emptySubmission(): Submission {
    return {
        id: "",
        formId: "",
        responses: [],
        submittedAt: new Date().toISOString(),
    };
}

function rowFromCache(args: {
    formId: string;
    formTitle: string;
    entry: SubmissionIndexEntry;
    cached: CachedSubmission | null;
}): InboxRow {
    const { formId, formTitle, entry, cached } = args;
    if (!cached) {
        return {
            submissionBlobId: entry.submissionBlobId,
            formId,
            formTitle,
            submittedAt: entry.submittedAt,
            submitterAddress: entry.submitterAddress ?? null,
            isEncrypted: entry.isEncrypted,
            isReadable: false,
            submission: null,
        };
    }
    if (cached.kind === "encrypted") {
        return {
            submissionBlobId: entry.submissionBlobId,
            formId,
            formTitle,
            submittedAt: entry.submittedAt,
            submitterAddress: entry.submitterAddress ?? null,
            isEncrypted: true,
            isReadable: false,
            submission: null,
            envelopeVersion: cached.envelopeVersion,
        };
    }
    return {
        submissionBlobId: entry.submissionBlobId,
        formId,
        formTitle,
        submittedAt: cached.submission.submittedAt || entry.submittedAt,
        submitterAddress: cached.submission.submitterAddress ?? entry.submitterAddress ?? null,
        isEncrypted: Boolean(cached.wasEncrypted),
        isReadable: true,
        submission: cached.submission,
    };
}
