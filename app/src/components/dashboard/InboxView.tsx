"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import Link from "next/link";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import type {
    AIAnalysis,
    FormConfig,
    FormField,
    Submission,
    SubmissionResponse,
    WalrusBlobRef,
} from "@/types";
import {
    EMPTY_INBOX,
    runInboxSync,
    type InboxRow,
    type InboxState,
} from "@/lib/inboxSync";
import {
    deleteView,
    DEFAULT_FILTERS,
    lastBackupMeta,
    listViews,
    newView,
    restoreViewsFromWalrus,
    upsertView,
    backupViewsToWalrus,
    type SavedView,
    type SortKey,
} from "@/lib/inboxViews";
import {
    hasAdminMetadata,
    loadAdminMetadata,
    saveAdminMetadata,
    type AdminMetadata,
} from "@/lib/adminMetadata";
import {
    loadInboxReviewState,
    saveInboxReviewState,
    type InboxReviewStatus,
} from "@/lib/inboxReviewState";
import {
    loadCachedAnalysis,
    subscribeAnalysisCompletions,
} from "@/lib/ai-submission-analysis";
import {
    downloadFile,
    exportInboxAsCSV,
    exportInboxAsJSON,
    type InboxExportRow,
} from "@/lib/exportResponses";
import { useScrollsAccount, useScrollsDAppKit } from "@/lib/useScrollsAccount";
import { fetchJSON, uploadBlob, blobUrl } from "@/lib/walrus";
import {
    decryptForForm,
    decryptForFormWithCryptoKey,
    isEncryptedEnvelope,
    loadFormPrivateKey,
} from "@/lib/crypto";
import { decryptFromPolicy, isSealEnvelope, type SealEnvelopeV2 } from "@/lib/seal";
import { loadHardenedFormPrivateKey } from "@/lib/keyStore";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText";
import { truncateAddress } from "@/lib/sui";
import { saveCachedSubmission } from "@/lib/submissionCache";

const easing = [0.25, 0.4, 0.25, 1] as const;
const PRIORITY_WEIGHT: Record<"low" | "medium" | "high" | "critical", number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
};
const PRIORITY_CHIP: Record<
    "low" | "medium" | "high" | "critical",
    { label: string; bg: string; ring: string; text: string }
> = {
    low: { label: "Low", bg: "bg-[#06b6d4]/10", ring: "border-[#06b6d4]/25", text: "text-[#06b6d4]" },
    medium: { label: "Medium", bg: "bg-[#a78bfa]/10", ring: "border-[#a78bfa]/25", text: "text-[#a78bfa]" },
    high: { label: "High", bg: "bg-amber-400/10", ring: "border-amber-400/25", text: "text-amber-300" },
    critical: { label: "Critical", bg: "bg-red-500/10", ring: "border-red-500/30", text: "text-red-400" },
};
const STATUS_COPY: Record<InboxReviewStatus, { label: string; className: string }> = {
    unread: {
        label: "Unread",
        className: "bg-[#a78bfa]/12 border-[#a78bfa]/25 text-[#c4b5fd]",
    },
    read: {
        label: "Read",
        className: "bg-white/[0.04] border-white/10 text-[color:var(--text-secondary)]",
    },
    archived: {
        label: "Archived",
        className: "bg-[#06b6d4]/10 border-[#06b6d4]/25 text-[#67e8f9]",
    },
};

type RowPriority = {
    value: "low" | "medium" | "high" | "critical";
    fromAi: boolean;
} | null;

interface EnrichedRow extends InboxRow {
    metadata: AdminMetadata;
    hasManualMetadata: boolean;
    reviewStatus: InboxReviewStatus;
    analysis: AIAnalysis | null;
    priority: RowPriority;
    formConfig: FormConfig | null;
}

interface DAppKitSealLike {
    signPersonalMessage: (args: { message: Uint8Array }) => Promise<{ signature: string }>;
}

export default function InboxView({
    ownerAddress,
    isConnected,
}: {
    ownerAddress: string | null;
    isConnected: boolean;
}) {
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();

    const [syncState, setSyncState] = useState<InboxState>(EMPTY_INBOX);
    const [syncNonce, setSyncNonce] = useState(0);
    const [metadataById, setMetadataById] = useState<Record<string, AdminMetadata>>({});
    const [hasManualMetadataById, setHasManualMetadataById] = useState<Record<string, boolean>>({});
    const [reviewById, setReviewById] = useState<Record<string, InboxReviewStatus>>({});
    const [analysisById, setAnalysisById] = useState<Record<string, AIAnalysis | null>>({});
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sortKey, setSortKey] = useState<SortKey>("newest");
    const [views, setViews] = useState<SavedView[]>([]);
    const [activeViewId, setActiveViewId] = useState<string | null>(null);
    const [saveViewName, setSaveViewName] = useState("");
    const [restoreBlobId, setRestoreBlobId] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [bulkTagInput, setBulkTagInput] = useState("");
    const [drawerTagInput, setDrawerTagInput] = useState("");
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<{ kind: "snapshot" | "views"; blobId: string; url: string } | null>(null);
    const [lastBackup, setLastBackup] = useState<{ blobId: string; backedUpAt: string; count: number } | null>(null);
    const [decryptError, setDecryptError] = useState<string | null>(null);

    useEffect(() => {
        setViews(listViews(ownerAddress));
        setLastBackup(lastBackupMeta(ownerAddress));
        setReceipt(null);
        setActiveViewId(null);
        setSaveViewName("");
        setRestoreBlobId("");
        setFilters(DEFAULT_FILTERS);
        setSortKey("newest");
        setSelectedIds([]);
    }, [ownerAddress]);

    useEffect(() => {
        setDrawerTagInput("");
        setDecryptError(null);
    }, [activeRowId]);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        setBanner(null);
        setSyncState((prev) => ({
            ...prev,
            isSyncing: true,
            error: null,
        }));
        void runInboxSync({
            ownerAddress,
            eagerAI: true,
            isCancelled: () => cancelled,
            onProgress: (snapshot) => {
                if (!cancelled) setSyncState(snapshot);
            },
        }).then((snapshot) => {
            if (!cancelled && snapshot.error) setError(snapshot.error);
        });
        return () => {
            cancelled = true;
        };
    }, [ownerAddress, syncNonce]);

    useEffect(() => {
        const nextMetadata: Record<string, AdminMetadata> = {};
        const nextManual: Record<string, boolean> = {};
        const nextReview: Record<string, InboxReviewStatus> = {};
        const nextAnalysis: Record<string, AIAnalysis | null> = {};

        for (const row of syncState.rows) {
            nextMetadata[row.submissionBlobId] = loadAdminMetadata(row.formId, row.submissionBlobId);
            nextManual[row.submissionBlobId] = hasAdminMetadata(row.formId, row.submissionBlobId);
            nextReview[row.submissionBlobId] = loadInboxReviewState(row.formId, row.submissionBlobId).status;
            nextAnalysis[row.submissionBlobId] = loadCachedAnalysis(row.submissionBlobId);
        }

        setMetadataById(nextMetadata);
        setHasManualMetadataById(nextManual);
        setReviewById(nextReview);
        setAnalysisById((prev) => ({ ...nextAnalysis, ...prev }));
        setSelectedIds((prev) => prev.filter((id) => syncState.rows.some((row) => row.submissionBlobId === id)));
        setActiveRowId((prev) =>
            prev && syncState.rows.some((row) => row.submissionBlobId === prev) ? prev : null,
        );
    }, [syncState.rows]);

    useEffect(() => {
        return subscribeAnalysisCompletions((blobId, analysis) => {
            setAnalysisById((prev) => ({ ...prev, [blobId]: analysis }));
        });
    }, []);

    useEffect(() => {
        if (!banner) return;
        const timeout = window.setTimeout(() => setBanner(null), 3200);
        return () => window.clearTimeout(timeout);
    }, [banner]);

    const formMap = useMemo(() => {
        return new Map(syncState.forms.map((form) => [form.formId, form]));
    }, [syncState.forms]);

    const enrichedRows = useMemo<EnrichedRow[]>(() => {
        return syncState.rows.map((row) => {
            const metadata = metadataById[row.submissionBlobId] ?? loadAdminMetadata(row.formId, row.submissionBlobId);
            const hasManualMetadata = hasManualMetadataById[row.submissionBlobId] ?? false;
            const analysis = analysisById[row.submissionBlobId] ?? null;
            return {
                ...row,
                metadata,
                hasManualMetadata,
                reviewStatus: reviewById[row.submissionBlobId] ?? "unread",
                analysis,
                priority: resolvePriority(metadata, hasManualMetadata, analysis),
                formConfig: formMap.get(row.formId)?.config ?? null,
            };
        });
    }, [analysisById, formMap, hasManualMetadataById, metadataById, reviewById, syncState.rows]);

    const allTags = useMemo(() => {
        return Array.from(
            new Set(enrichedRows.flatMap((row) => row.metadata.tags.map((tag) => tag.trim()).filter(Boolean))),
        ).sort((a, b) => a.localeCompare(b));
    }, [enrichedRows]);

    const visibleRows = useMemo(() => {
        const needle = filters.search.trim().toLowerCase();
        const now = Date.now();
        const filtered = enrichedRows.filter((row) => {
            if (filters.formIds.length > 0 && !filters.formIds.includes(row.formId)) return false;
            if (filters.priority !== "all" && row.priority?.value !== filters.priority) return false;
            if (filters.status !== "all" && row.reviewStatus !== filters.status) return false;
            if (filters.encryption === "public" && row.isEncrypted) return false;
            if (filters.encryption === "encrypted" && !row.isEncrypted) return false;
            if (filters.encryption === "locked" && (!row.isEncrypted || row.isReadable)) return false;
            if (filters.tags.length > 0 && !filters.tags.some((tag) => row.metadata.tags.includes(tag))) return false;
            if (filters.sinceDays !== null) {
                const cutoff = now - filters.sinceDays * 24 * 60 * 60 * 1000;
                if (new Date(row.submittedAt).getTime() < cutoff) return false;
            }
            if (!needle) return true;
            return buildSearchText(row).includes(needle);
        });

        return filtered.sort((a, b) => compareRows(a, b, sortKey));
    }, [enrichedRows, filters, sortKey]);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const activeRow = useMemo(
        () => enrichedRows.find((row) => row.submissionBlobId === activeRowId) ?? null,
        [activeRowId, enrichedRows],
    );
    const selectedRows = useMemo(
        () => visibleRows.filter((row) => selectedSet.has(row.submissionBlobId)),
        [selectedSet, visibleRows],
    );
    const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedSet.has(row.submissionBlobId));

    const summary = useMemo(() => {
        const locked = visibleRows.filter((row) => row.isEncrypted && !row.isReadable).length;
        const critical = visibleRows.filter((row) => row.priority?.value === "critical").length;
        return { total: visibleRows.length, locked, critical };
    }, [visibleRows]);

    const updateMetadata = (row: EnrichedRow, patch: Partial<AdminMetadata>) => {
        const next: AdminMetadata = {
            ...(metadataById[row.submissionBlobId] ?? loadAdminMetadata(row.formId, row.submissionBlobId)),
            ...patch,
            lastUpdated: new Date().toISOString(),
        };
        saveAdminMetadata(row.formId, row.submissionBlobId, next);
        setMetadataById((prev) => ({ ...prev, [row.submissionBlobId]: next }));
        setHasManualMetadataById((prev) => ({ ...prev, [row.submissionBlobId]: true }));
    };

    const updateReview = (row: EnrichedRow, status: InboxReviewStatus) => {
        saveInboxReviewState(row.formId, row.submissionBlobId, status);
        setReviewById((prev) => ({ ...prev, [row.submissionBlobId]: status }));
    };

    const applyFilters = (patch: Partial<typeof DEFAULT_FILTERS>) => {
        setActiveViewId(null);
        setFilters((prev) => ({ ...prev, ...patch }));
    };

    const handleOpenRow = (row: EnrichedRow) => {
        setActiveRowId(row.submissionBlobId);
        setDecryptError(null);
        if (row.reviewStatus === "unread") updateReview(row, "read");
    };

    const handleToggleSelect = (blobId: string) => {
        setSelectedIds((prev) =>
            prev.includes(blobId) ? prev.filter((id) => id !== blobId) : [...prev, blobId],
        );
    };

    const handleToggleAllVisible = () => {
        if (allVisibleSelected) {
            setSelectedIds((prev) => prev.filter((id) => !visibleRows.some((row) => row.submissionBlobId === id)));
            return;
        }
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const row of visibleRows) next.add(row.submissionBlobId);
            return Array.from(next);
        });
    };

    const handleSaveView = () => {
        const name = saveViewName.trim();
        if (!name) return;
        const view = newView(name, {
            filters,
            sort: sortKey,
        });
        const next = upsertView(ownerAddress, view);
        setViews(next);
        setActiveViewId(view.id);
        setSaveViewName("");
        setBanner(`Saved view “${view.name}”.`);
    };

    const handleApplyView = (view: SavedView) => {
        setActiveViewId(view.id);
        setFilters(view.filters);
        setSortKey(view.sort);
    };

    const handleDeleteView = (id: string) => {
        const next = deleteView(ownerAddress, id);
        setViews(next);
        if (activeViewId === id) setActiveViewId(null);
    };

    const handleBackupViews = async () => {
        try {
            setBusyAction("backup-views");
            const meta = await backupViewsToWalrus(ownerAddress);
            setLastBackup(meta);
            setReceipt({ kind: "views", blobId: meta.blobId, url: blobUrl(meta.blobId) });
            setBanner("Saved views backed up to Walrus.");
            if (typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText(meta.blobId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to back up saved views.");
        } finally {
            setBusyAction(null);
        }
    };

    const handleRestoreViews = async () => {
        const blobId = restoreBlobId.trim();
        if (!blobId) return;
        try {
            setBusyAction("restore-views");
            const next = await restoreViewsFromWalrus(ownerAddress, blobId);
            setViews(next);
            setRestoreBlobId("");
            setBanner(`Restored ${next.length} saved view${next.length === 1 ? "" : "s"}.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to restore views from Walrus.");
        } finally {
            setBusyAction(null);
        }
    };

    const handleBulkPriority = (priority: "low" | "medium" | "high" | "critical") => {
        for (const row of selectedRows) {
            updateMetadata(row, { priority });
            updateReview(row, "read");
        }
        setBanner(`Updated priority on ${selectedRows.length} row${selectedRows.length === 1 ? "" : "s"}.`);
    };

    const handleBulkTag = () => {
        const tag = bulkTagInput.trim();
        if (!tag) return;
        for (const row of selectedRows) {
            const tags = Array.from(new Set([...(row.metadata.tags ?? []), tag]));
            updateMetadata(row, { tags });
            updateReview(row, "read");
        }
        setBulkTagInput("");
        setBanner(`Tagged ${selectedRows.length} row${selectedRows.length === 1 ? "" : "s"} with “${tag}”.`);
    };

    const handleBulkStatus = (status: InboxReviewStatus) => {
        for (const row of selectedRows) updateReview(row, status);
        setBanner(`Moved ${selectedRows.length} row${selectedRows.length === 1 ? "" : "s"} to ${STATUS_COPY[status].label.toLowerCase()}.`);
    };

    const buildSelectedExportRows = (): InboxExportRow[] => {
        return selectedRows.map((row) => toInboxExportRow(row));
    };

    const handleExport = (format: "csv" | "json") => {
        const rows = buildSelectedExportRows();
        if (rows.length === 0) return;
        if (format === "csv") {
            downloadFile(
                `scrolls-inbox-${new Date().toISOString().slice(0, 10)}.csv`,
                exportInboxAsCSV(rows),
                "text/csv;charset=utf-8",
            );
            return;
        }
        downloadFile(
            `scrolls-inbox-${new Date().toISOString().slice(0, 10)}.json`,
            exportInboxAsJSON(rows),
            "application/json;charset=utf-8",
        );
    };

    const handlePublishSnapshot = async () => {
        const rows = buildSelectedExportRows();
        if (rows.length === 0) return;
        try {
            setBusyAction("publish-snapshot");
            const csv = exportInboxAsCSV(rows);
            const blobId = await uploadBlob(new TextEncoder().encode(csv), "text/csv;charset=utf-8");
            setReceipt({ kind: "snapshot", blobId, url: blobUrl(blobId) });
            setBanner("CSV snapshot published to Walrus.");
            if (typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText(blobId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to publish CSV snapshot.");
        } finally {
            setBusyAction(null);
        }
    };

    const handleDecryptActive = async () => {
        if (!activeRow) return;
        try {
            setBusyAction("decrypt");
            setDecryptError(null);
            const raw = await fetchJSON<unknown>(activeRow.submissionBlobId);
            const submission = await decryptToSubmission(
                raw,
                activeRow.formId,
                (dAppKit as DAppKitSealLike | null) ?? null,
                account?.address ?? null,
            );
            saveCachedSubmission(activeRow.submissionBlobId, {
                kind: "plain",
                submission,
                wasEncrypted: true,
                cachedAt: new Date().toISOString(),
            });
            setSyncState((prev) => ({
                ...prev,
                rows: prev.rows.map((row) =>
                    row.submissionBlobId === activeRow.submissionBlobId
                        ? {
                            ...row,
                            isEncrypted: true,
                            isReadable: true,
                            submission,
                        }
                        : row,
                ),
            }));
            updateReview(activeRow, "read");
            setBanner("Submission decrypted and cached on this device.");
        } catch (err) {
            setDecryptError(err instanceof Error ? err.message : "Decryption failed.");
        } finally {
            setBusyAction(null);
        }
    };

    const handleAddDrawerTag = () => {
        if (!activeRow) return;
        const tag = drawerTagInput.trim();
        if (!tag) return;
        updateMetadata(activeRow, {
            tags: Array.from(new Set([...(activeRow.metadata.tags ?? []), tag])),
        });
        setDrawerTagInput("");
    };

    return (
        <motion.section
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easing } } }}
            initial="hidden"
            animate="show"
            className="space-y-6"
        >
            <div className="overflow-hidden rounded-[28px] border border-[color:var(--border-default)] bg-[color:var(--surface-panel)]/90 backdrop-blur-xl">
                <div className="border-b border-[color:var(--border-subtle)] px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#06b6d4]/20 bg-[#06b6d4]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#67e8f9]">
                                <Icon icon="fluent:inprivate-account-20-regular" className="h-3.5 w-3.5" />
                                Inbox
                            </div>
                            <h2 className="text-2xl font-display font-semibold tracking-tight text-[color:var(--text-primary)]">
                                Cross-form review queue
                            </h2>
                            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
                                Review every response in one place, keep triage local, and publish permanent CSV snapshots when you need an auditable cut.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[320px]">
                            <MiniStat label="Visible" value={String(summary.total)} icon="fluent:list-24-regular" />
                            <MiniStat label="Locked" value={String(summary.locked)} icon="fluent:lock-closed-24-regular" />
                            <MiniStat label="Critical" value={String(summary.critical)} icon="fluent:warning-24-regular" />
                        </div>
                    </div>
                </div>

                <div className="space-y-5 px-5 py-5 sm:px-6">
                    {banner && (
                        <div className="rounded-2xl border border-[#06b6d4]/20 bg-[#06b6d4]/10 px-4 py-3 text-sm text-[#9ae6f5]">
                            {banner}
                        </div>
                    )}
                    {error && (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}
                    {!isConnected && (
                        <div className="rounded-2xl border border-[#a78bfa]/20 bg-[#a78bfa]/10 px-4 py-3 text-sm text-[#ddd6fe]">
                            Wallet disconnected. The inbox still reads browser-local forms and submissions, but cross-device discovery and Seal decryption stay unavailable until you reconnect.
                        </div>
                    )}
                    {receipt && (
                        <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--background-subtle)] px-4 py-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                {receipt.kind === "snapshot" ? "Snapshot receipt" : "Views backup receipt"}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--text-secondary)] break-all">{receipt.blobId}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <a
                                    href={receipt.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-default)] px-3 py-1.5 text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)]"
                                >
                                    <Icon icon="fluent:open-24-regular" className="h-3.5 w-3.5" />
                                    Open Walrus blob
                                </a>
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard?.writeText(receipt.blobId)}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-default)] px-3 py-1.5 text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)]"
                                >
                                    <Icon icon="fluent:copy-24-regular" className="h-3.5 w-3.5" />
                                    Copy blob id
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-4 sm:p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="space-y-3">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                        Saved views
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {views.length === 0 ? (
                                            <span className="rounded-full border border-dashed border-[color:var(--border-default)] px-3 py-1.5 text-xs text-[color:var(--text-tertiary)]">
                                                No saved views yet
                                            </span>
                                        ) : (
                                            views.map((view) => (
                                                <div key={view.id} className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] px-1.5 py-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApplyView(view)}
                                                        className={clsx(
                                                            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                                                            activeViewId === view.id
                                                                ? "bg-[#a78bfa]/15 text-[#ddd6fe]"
                                                                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                                                        )}
                                                    >
                                                        {view.name}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteView(view.id)}
                                                        className="rounded-full p-1 text-[color:var(--text-muted)] transition-colors hover:text-red-300"
                                                        aria-label={`Delete ${view.name}`}
                                                    >
                                                        <Icon icon="fluent:dismiss-12-regular" className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                        type="text"
                                        value={saveViewName}
                                        onChange={(event) => setSaveViewName(event.target.value)}
                                        placeholder="Name current view"
                                        className="min-w-[210px] rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSaveView}
                                        disabled={!saveViewName.trim()}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Icon icon="fluent:bookmark-add-24-regular" className="h-4 w-4" />
                                        Save current view
                                    </button>
                                </div>
                            </div>

                            <div className="flex max-w-full flex-col gap-2 xl:min-w-[360px]">
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => void handleBackupViews()}
                                        disabled={busyAction === "backup-views"}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)] disabled:opacity-50"
                                    >
                                        {busyAction === "backup-views" ? (
                                            <Icon icon="fluent:spinner-ios-20-regular" className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Icon icon="fluent:cloud-arrow-up-24-regular" className="h-4 w-4" />
                                        )}
                                        Backup views to Walrus
                                    </button>
                                    <div className="flex min-w-0 flex-1 gap-2">
                                        <input
                                            type="text"
                                            value={restoreBlobId}
                                            onChange={(event) => setRestoreBlobId(event.target.value)}
                                            placeholder="Paste backup blob id"
                                            className="min-w-0 flex-1 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => void handleRestoreViews()}
                                            disabled={!restoreBlobId.trim() || busyAction === "restore-views"}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)] disabled:opacity-50"
                                        >
                                            {busyAction === "restore-views" ? (
                                                <Icon icon="fluent:spinner-ios-20-regular" className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Icon icon="fluent:arrow-sync-24-regular" className="h-4 w-4" />
                                            )}
                                            Restore
                                        </button>
                                    </div>
                                </div>
                                {lastBackup && (
                                    <p className="text-xs text-[color:var(--text-tertiary)]">
                                        Last backup: {new Date(lastBackup.backedUpAt).toLocaleString()} · {lastBackup.count} saved view{lastBackup.count === 1 ? "" : "s"}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <FilterBox icon="fluent:search-24-regular" label="Search">
                                <input
                                    type="text"
                                    value={filters.search}
                                    onChange={(event) => applyFilters({ search: event.target.value })}
                                    placeholder="Search forms, tags, notes, answers"
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none"
                                />
                            </FilterBox>
                            <FilterBox icon="fluent:document-24-regular" label="Form">
                                <select
                                    value={filters.formIds[0] ?? "all"}
                                    onChange={(event) => applyFilters({ formIds: event.target.value === "all" ? [] : [event.target.value] })}
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none"
                                >
                                    <option value="all">All forms</option>
                                    {syncState.forms.map((form) => (
                                        <option key={form.formId} value={form.formId}>{form.title}</option>
                                    ))}
                                </select>
                            </FilterBox>
                            <FilterBox icon="fluent:flag-24-regular" label="Priority">
                                <select
                                    value={filters.priority}
                                    onChange={(event) => applyFilters({ priority: event.target.value as typeof filters.priority })}
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none"
                                >
                                    <option value="all">All priorities</option>
                                    <option value="critical">Critical</option>
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </FilterBox>
                            <FilterBox icon="fluent:tag-24-regular" label="Tag">
                                <select
                                    value={filters.tags[0] ?? "all"}
                                    onChange={(event) => applyFilters({ tags: event.target.value === "all" ? [] : [event.target.value] })}
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none"
                                >
                                    <option value="all">All tags</option>
                                    {allTags.map((tag) => (
                                        <option key={tag} value={tag}>{tag}</option>
                                    ))}
                                </select>
                            </FilterBox>
                            <FilterBox icon="fluent:mail-read-24-regular" label="Status">
                                <select
                                    value={filters.status}
                                    onChange={(event) => applyFilters({ status: event.target.value as typeof filters.status })}
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none"
                                >
                                    <option value="all">All statuses</option>
                                    <option value="unread">Unread</option>
                                    <option value="read">Read</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </FilterBox>
                            <FilterBox icon="fluent:lock-closed-24-regular" label="Visibility">
                                <select
                                    value={filters.encryption}
                                    onChange={(event) => applyFilters({ encryption: event.target.value as typeof filters.encryption })}
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none"
                                >
                                    <option value="all">All rows</option>
                                    <option value="public">Public only</option>
                                    <option value="encrypted">Encrypted</option>
                                    <option value="locked">Locked only</option>
                                </select>
                            </FilterBox>
                            <FilterBox icon="fluent:calendar-24-regular" label="Date range">
                                <select
                                    value={filters.sinceDays === null ? "all" : String(filters.sinceDays)}
                                    onChange={(event) => applyFilters({ sinceDays: event.target.value === "all" ? null : Number(event.target.value) })}
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none"
                                >
                                    <option value="all">All time</option>
                                    <option value="1">Last 24 hours</option>
                                    <option value="7">Last 7 days</option>
                                    <option value="30">Last 30 days</option>
                                    <option value="90">Last 90 days</option>
                                </select>
                            </FilterBox>
                            <FilterBox icon="fluent:arrow-sort-24-regular" label="Sort">
                                <select
                                    value={sortKey}
                                    onChange={(event) => {
                                        setActiveViewId(null);
                                        setSortKey(event.target.value as SortKey);
                                    }}
                                    className="w-full bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none"
                                >
                                    <option value="newest">Newest first</option>
                                    <option value="oldest">Oldest first</option>
                                    <option value="priority">Priority first</option>
                                    <option value="sentiment">Most negative first</option>
                                </select>
                            </FilterBox>
                        </div>
                        <div className="flex flex-col gap-2 xl:items-end">
                            <button
                                type="button"
                                onClick={() => setSyncNonce((value) => value + 1)}
                                disabled={syncState.isSyncing}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)] disabled:opacity-50"
                            >
                                {syncState.isSyncing ? (
                                    <Icon icon="fluent:spinner-ios-20-regular" className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Icon icon="fluent:arrow-sync-24-regular" className="h-4 w-4" />
                                )}
                                Refresh inbox
                            </button>
                            <div className="text-right text-xs text-[color:var(--text-tertiary)]">
                                <div>
                                    {syncState.progress.fetched}/{syncState.progress.total} rows hydrated
                                </div>
                                {syncState.lastSyncedAt && (
                                    <div>Last synced {new Date(syncState.lastSyncedAt).toLocaleTimeString()}</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="h-1 overflow-hidden rounded-full bg-[color:var(--background-subtle)]">
                        <motion.div
                            animate={{ scaleX: syncState.progress.total === 0 ? 0 : syncState.progress.fetched / syncState.progress.total }}
                            transition={{ duration: 0.25, ease: easing }}
                            className="h-full origin-left bg-[linear-gradient(90deg,#a78bfa_0%,#06b6d4_100%)]"
                        />
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-4 sm:p-5">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                    Bulk actions
                                </p>
                                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                                    {selectedRows.length === 0
                                        ? "Select rows to export, snapshot, or update triage in bulk."
                                        : `${selectedRows.length} row${selectedRows.length === 1 ? "" : "s"} selected.`}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(["critical", "high", "medium", "low"] as const).map((priority) => (
                                    <button
                                        key={priority}
                                        type="button"
                                        onClick={() => handleBulkPriority(priority)}
                                        disabled={selectedRows.length === 0}
                                        className={clsx(
                                            "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-40",
                                            PRIORITY_CHIP[priority].bg,
                                            PRIORITY_CHIP[priority].ring,
                                            PRIORITY_CHIP[priority].text,
                                        )}
                                    >
                                        {PRIORITY_CHIP[priority].label}
                                    </button>
                                ))}
                                <div className="flex items-center gap-2 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] px-2 py-1">
                                    <input
                                        type="text"
                                        value={bulkTagInput}
                                        onChange={(event) => setBulkTagInput(event.target.value)}
                                        placeholder="Tag selected"
                                        className="w-28 bg-transparent px-1 text-xs text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleBulkTag}
                                        disabled={selectedRows.length === 0 || !bulkTagInput.trim()}
                                        className="rounded-full bg-[color:var(--brand-primary)] px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                    >
                                        Add
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleBulkStatus("archived")}
                                    disabled={selectedRows.length === 0}
                                    className="rounded-full border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[#06b6d4]/25 hover:text-[#67e8f9] disabled:opacity-40"
                                >
                                    Archive
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleBulkStatus("read")}
                                    disabled={selectedRows.length === 0}
                                    className="rounded-full border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)] disabled:opacity-40"
                                >
                                    Mark read
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleExport("csv")}
                                    disabled={selectedRows.length === 0}
                                    className="rounded-full border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)] disabled:opacity-40"
                                >
                                    Export CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleExport("json")}
                                    disabled={selectedRows.length === 0}
                                    className="rounded-full border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)] disabled:opacity-40"
                                >
                                    Export JSON
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handlePublishSnapshot()}
                                    disabled={selectedRows.length === 0 || busyAction === "publish-snapshot"}
                                    className="rounded-full bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                >
                                    {busyAction === "publish-snapshot" ? "Publishing…" : "Publish snapshot"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)]">
                        <div className="grid grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] sm:px-5">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={handleToggleAllVisible}
                                    className="h-4 w-4 rounded border-[color:var(--border-default)] bg-transparent"
                                />
                                Select
                            </label>
                            <span>Submission</span>
                            <span>Signals</span>
                            <span className="text-right">Submitted</span>
                        </div>

                        {visibleRows.length === 0 && syncState.isSyncing ? (
                            <div className="space-y-3 p-4 sm:p-5">
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <div key={index} className="animate-pulse rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] p-4">
                                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_160px]">
                                            <div className="space-y-2">
                                                <div className="h-4 w-2/5 rounded bg-white/10" />
                                                <div className="h-3 w-4/5 rounded bg-white/5" />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="h-3 w-2/3 rounded bg-white/5" />
                                                <div className="h-3 w-1/2 rounded bg-white/5" />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="ml-auto h-3 w-24 rounded bg-white/5" />
                                                <div className="ml-auto h-3 w-16 rounded bg-white/5" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : visibleRows.length === 0 ? (
                            <div className="px-5 py-14 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] text-[color:var(--text-secondary)]">
                                    <Icon icon="fluent:filter-dismiss-24-regular" className="h-7 w-7" />
                                </div>
                                <h3 className="mt-4 text-lg font-display font-semibold text-[color:var(--text-primary)]">
                                    No rows match the current view
                                </h3>
                                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                                    Broaden the filters or refresh the inbox if you expect new submissions.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[color:var(--border-subtle)]">
                                {visibleRows.map((row) => (
                                    <div
                                        key={row.submissionBlobId}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleOpenRow(row)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                handleOpenRow(row);
                                            }
                                        }}
                                        className={clsx(
                                            "grid w-full grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left transition-colors sm:px-5",
                                            activeRowId === row.submissionBlobId
                                                ? "bg-[#a78bfa]/8"
                                                : "hover:bg-white/[0.025]",
                                        )}
                                    >
                                        <div className="flex items-start pt-0.5">
                                            <input
                                                type="checkbox"
                                                checked={selectedSet.has(row.submissionBlobId)}
                                                onChange={() => handleToggleSelect(row.submissionBlobId)}
                                                onClick={(event) => event.stopPropagation()}
                                                className="mt-1 h-4 w-4 rounded border-[color:var(--border-default)] bg-transparent"
                                                aria-label={`Select ${row.submissionBlobId}`}
                                            />
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="truncate text-sm font-semibold text-[color:var(--text-primary)]">
                                                    {row.formTitle}
                                                </span>
                                                {row.priority && (
                                                    <PriorityChip priority={row.priority.value} fromAi={row.priority.fromAi} />
                                                )}
                                                {row.isEncrypted && (
                                                    <span className={clsx(
                                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                                        row.isReadable
                                                            ? "border-[#06b6d4]/25 bg-[#06b6d4]/10 text-[#67e8f9]"
                                                            : "border-amber-400/20 bg-amber-400/10 text-amber-300",
                                                    )}>
                                                        <Icon icon="fluent:lock-closed-24-regular" className="h-3 w-3" />
                                                        {row.isReadable ? "Decrypted" : "Locked"}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
                                                {previewRow(row)}
                                            </p>
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-tertiary)]">
                                                <span>{row.submitterAddress ? truncateAddress(row.submitterAddress) : "Anonymous"}</span>
                                                <span>·</span>
                                                <span className="font-mono">{shortBlob(row.submissionBlobId)}</span>
                                                {row.metadata.tags.slice(0, 3).map((tag) => (
                                                    <span key={tag} className="rounded-full border border-[color:var(--border-default)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap gap-2">
                                                <StatusChip status={row.reviewStatus} />
                                                {row.analysis?.sentiment && (
                                                    <span className={clsx(
                                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                                        sentimentClasses(row.analysis.sentiment),
                                                    )}>
                                                        <Icon icon="fluent:sparkle-16-regular" className="h-3 w-3" />
                                                        {row.analysis.sentiment}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 line-clamp-2 text-sm text-[color:var(--text-secondary)]">
                                                {(row.analysis?.summary ?? row.metadata.notes) || "No AI summary yet. Open the row to review details and notes."}
                                            </p>
                                        </div>

                                        <div className="text-right text-xs text-[color:var(--text-tertiary)]">
                                            <div>{formatDate(row.submittedAt)}</div>
                                            <div className="mt-1">{formatTime(row.submittedAt)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {activeRow && (
                    <motion.div
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setActiveRowId(null)}
                    >
                        <motion.aside
                            initial={{ x: 24, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 24, opacity: 0 }}
                            transition={{ duration: 0.24, ease: easing }}
                            onClick={(event) => event.stopPropagation()}
                            className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[color:var(--border-default)] bg-[color:var(--surface-solid)]"
                        >
                            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] px-5 py-5 sm:px-6">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                                        Response details
                                    </p>
                                    <h3 className="mt-1 truncate text-xl font-display font-semibold tracking-tight text-[color:var(--text-primary)]">
                                        {activeRow.formTitle}
                                    </h3>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                                        <span>{activeRow.submitterAddress ? truncateAddress(activeRow.submitterAddress) : "Anonymous respondent"}</span>
                                        <span>·</span>
                                        <span>{formatDateTime(activeRow.submittedAt)}</span>
                                        <span>·</span>
                                        <span className="font-mono">{shortBlob(activeRow.submissionBlobId)}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveRowId(null)}
                                    className="rounded-full p-2 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-primary)]"
                                    aria-label="Close drawer"
                                >
                                    <Icon icon="fluent:dismiss-24-regular" className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                                <div className="space-y-6">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Panel title="Review status">
                                            <div className="flex flex-wrap gap-2">
                                                {(["unread", "read", "archived"] as const).map((status) => (
                                                    <button
                                                        key={status}
                                                        type="button"
                                                        onClick={() => updateReview(activeRow, status)}
                                                        className={clsx(
                                                            "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                                                            activeRow.reviewStatus === status
                                                                ? STATUS_COPY[status].className
                                                                : "border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                                                        )}
                                                    >
                                                        {STATUS_COPY[status].label}
                                                    </button>
                                                ))}
                                            </div>
                                        </Panel>
                                        <Panel title="Priority">
                                            <div className="flex flex-wrap gap-2">
                                                {(["critical", "high", "medium", "low"] as const).map((priority) => (
                                                    <button
                                                        key={priority}
                                                        type="button"
                                                        onClick={() => updateMetadata(activeRow, { priority })}
                                                        className={clsx(
                                                            "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                                                            activeRow.priority?.value === priority && !activeRow.priority.fromAi
                                                                ? `${PRIORITY_CHIP[priority].bg} ${PRIORITY_CHIP[priority].ring} ${PRIORITY_CHIP[priority].text}`
                                                                : "border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                                                        )}
                                                    >
                                                        {PRIORITY_CHIP[priority].label}
                                                    </button>
                                                ))}
                                            </div>
                                            {activeRow.priority?.fromAi && (
                                                <p className="mt-3 text-xs text-[color:var(--text-tertiary)]">
                                                    AI currently suggests {activeRow.priority.value}. Click a chip above to override locally.
                                                </p>
                                            )}
                                        </Panel>
                                    </div>

                                    <Panel title="Notes">
                                        <textarea
                                            value={activeRow.metadata.notes}
                                            onChange={(event) => updateMetadata(activeRow, { notes: event.target.value })}
                                            placeholder="Capture review notes, follow-ups, or repro steps."
                                            className="min-h-28 w-full rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--background-subtle)] px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                                        />
                                    </Panel>

                                    <Panel title="Tags">
                                        <div className="flex flex-wrap gap-2">
                                            {activeRow.metadata.tags.length === 0 ? (
                                                <span className="text-sm text-[color:var(--text-tertiary)]">No tags yet.</span>
                                            ) : (
                                                activeRow.metadata.tags.map((tag) => (
                                                    <button
                                                        key={tag}
                                                        type="button"
                                                        onClick={() => updateMetadata(activeRow, { tags: activeRow.metadata.tags.filter((value) => value !== tag) })}
                                                        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-default)] bg-[color:var(--background-subtle)] px-3 py-1.5 text-xs text-[color:var(--text-secondary)] transition-colors hover:text-red-300"
                                                    >
                                                        {tag}
                                                        <Icon icon="fluent:dismiss-12-regular" className="h-3.5 w-3.5" />
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <input
                                                type="text"
                                                value={drawerTagInput}
                                                onChange={(event) => setDrawerTagInput(event.target.value)}
                                                placeholder="Add tag"
                                                className="flex-1 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--background-subtle)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddDrawerTag}
                                                disabled={!drawerTagInput.trim()}
                                                className="rounded-xl bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </Panel>

                                    <Panel title="AI summary">
                                        {activeRow.analysis ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <PriorityChip priority={activeRow.analysis.suggestedPriority} fromAi />
                                                    <span className={clsx(
                                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                                        sentimentClasses(activeRow.analysis.sentiment),
                                                    )}>
                                                        <Icon icon="fluent:sparkle-16-regular" className="h-3 w-3" />
                                                        {activeRow.analysis.sentiment}
                                                    </span>
                                                    <span className="text-xs text-[color:var(--text-tertiary)]">
                                                        Score {(activeRow.analysis.sentimentScore * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                                <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
                                                    {activeRow.analysis.summary}
                                                </p>
                                                {activeRow.analysis.topics.length > 0 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {activeRow.analysis.topics.map((topic) => (
                                                            <span
                                                                key={topic}
                                                                className="rounded-full border border-[color:var(--border-default)] px-3 py-1 text-xs uppercase tracking-[0.12em] text-[color:var(--text-secondary)]"
                                                            >
                                                                {topic}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-[color:var(--text-tertiary)]">
                                                Analysis will appear here after the background queue finishes. If the proxy is disabled, the inbox continues without AI.
                                            </p>
                                        )}
                                    </Panel>

                                    <Panel title="Responses">
                                        {!activeRow.isReadable && activeRow.isEncrypted ? (
                                            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <div>
                                                        <p className="font-semibold">This submission is encrypted on Walrus.</p>
                                                        <p className="mt-1 text-amber-100/80">
                                                            {activeRow.envelopeVersion === "v2"
                                                                ? "Seal decryption requires the owner or an approved admin wallet."
                                                                : "ECIES decryption requires the form private key saved on this device."}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDecryptActive()}
                                                        disabled={busyAction === "decrypt"}
                                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-[#241500] transition-opacity hover:opacity-90 disabled:opacity-50"
                                                    >
                                                        {busyAction === "decrypt" ? (
                                                            <Icon icon="fluent:spinner-ios-20-regular" className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Icon icon="fluent:lock-open-24-regular" className="h-4 w-4" />
                                                        )}
                                                        Decrypt on this device
                                                    </button>
                                                </div>
                                                {decryptError && <p className="mt-3 text-sm text-red-100">{decryptError}</p>}
                                            </div>
                                        ) : !activeRow.isReadable ? (
                                            <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-4 text-sm text-[color:var(--text-secondary)]">
                                                The submission body has not been hydrated yet. Refresh the inbox to retry the Walrus fetch.
                                            </div>
                                        ) : activeRow.submission ? (
                                            <div className="space-y-4">
                                                {renderSubmissionResponses(activeRow.submission, activeRow.formConfig)}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-[color:var(--text-tertiary)]">Response body unavailable.</p>
                                        )}
                                    </Panel>

                                    <Panel title="Links">
                                        <div className="flex flex-wrap gap-2 text-sm">
                                            <Link
                                                href={`/responses?id=${activeRow.formId}`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 py-2 text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)]"
                                            >
                                                <Icon icon="fluent:chat-multiple-24-regular" className="h-4 w-4" />
                                                Open per-form responses
                                            </Link>
                                            <a
                                                href={blobUrl(activeRow.submissionBlobId)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 py-2 text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--brand-primary-soft)] hover:text-[color:var(--text-primary)]"
                                            >
                                                <Icon icon="fluent:open-24-regular" className="h-4 w-4" />
                                                Open raw Walrus blob
                                            </a>
                                        </div>
                                    </Panel>
                                </div>
                            </div>
                        </motion.aside>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.section>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                {title}
            </p>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: string }) {
    return (
        <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] p-3">
            <div className="flex items-center justify-between gap-2 text-[color:var(--text-tertiary)]">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">{label}</span>
                <Icon icon={icon} className="h-4 w-4" />
            </div>
            <div className="mt-2 text-xl font-display font-semibold tracking-tight text-[color:var(--text-primary)]">
                {value}
            </div>
        </div>
    );
}

function FilterBox({
    icon,
    label,
    children,
}: {
    icon: string;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-tertiary)]">
                <Icon icon={icon} className="h-3.5 w-3.5" />
                {label}
            </div>
            {children}
        </label>
    );
}

function PriorityChip({
    priority,
    fromAi,
}: {
    priority: "low" | "medium" | "high" | "critical";
    fromAi: boolean;
}) {
    const c = PRIORITY_CHIP[priority];
    return (
        <span
            className={clsx(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                c.bg,
                c.ring,
                c.text,
            )}
            title={fromAi ? `AI suggested ${c.label}` : `${c.label} priority`}
        >
            {fromAi && <Icon icon="fluent:sparkle-12-regular" className="h-3 w-3" />}
            {c.label}
        </span>
    );
}

function StatusChip({ status }: { status: InboxReviewStatus }) {
    return (
        <span className={clsx(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            STATUS_COPY[status].className,
        )}>
            {STATUS_COPY[status].label}
        </span>
    );
}

async function decryptToSubmission(
    raw: unknown,
    formId: string,
    dAppKit: DAppKitSealLike | null,
    address: string | null,
): Promise<Submission> {
    if (isSealEnvelope(raw)) {
        if (!dAppKit || !address) {
            throw new Error("Connect the form owner or admin wallet to decrypt.");
        }
        const plaintext = await decryptFromPolicy(raw as SealEnvelopeV2, dAppKit, address);
        return JSON.parse(plaintext) as Submission;
    }
    if (isEncryptedEnvelope(raw)) {
        const hardenedKey = await loadHardenedFormPrivateKey(formId);
        if (hardenedKey) {
            const plaintext = await decryptForFormWithCryptoKey(raw, hardenedKey);
            return JSON.parse(plaintext) as Submission;
        }
        const keyJwk = loadFormPrivateKey(formId);
        if (!keyJwk) throw new Error("No decryption key found on this device.");
        const plaintext = await decryptForForm(raw, keyJwk);
        return JSON.parse(plaintext) as Submission;
    }
    return raw as Submission;
}

function resolvePriority(
    metadata: AdminMetadata,
    hasManualMetadata: boolean,
    analysis: AIAnalysis | null,
): RowPriority {
    if (hasManualMetadata) return { value: metadata.priority, fromAi: false };
    if (analysis) return { value: analysis.suggestedPriority, fromAi: true };
    return null;
}

function compareRows(a: EnrichedRow, b: EnrichedRow, sortKey: SortKey): number {
    if (sortKey === "oldest") return a.submittedAt.localeCompare(b.submittedAt);
    if (sortKey === "priority") {
        const aPriority = a.priority ? PRIORITY_WEIGHT[a.priority.value] : 0;
        const bPriority = b.priority ? PRIORITY_WEIGHT[b.priority.value] : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.submittedAt.localeCompare(a.submittedAt);
    }
    if (sortKey === "sentiment") {
        const aSentiment = sentimentWeight(a.analysis?.sentiment);
        const bSentiment = sentimentWeight(b.analysis?.sentiment);
        if (aSentiment !== bSentiment) return bSentiment - aSentiment;
        return b.submittedAt.localeCompare(a.submittedAt);
    }
    return b.submittedAt.localeCompare(a.submittedAt);
}

function sentimentWeight(sentiment: AIAnalysis["sentiment"] | undefined): number {
    if (sentiment === "negative") return 3;
    if (sentiment === "neutral") return 2;
    if (sentiment === "positive") return 1;
    return 0;
}

function sentimentClasses(sentiment: AIAnalysis["sentiment"]): string {
    if (sentiment === "negative") return "border-red-500/25 bg-red-500/10 text-red-300";
    if (sentiment === "positive") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    return "border-[color:var(--border-default)] bg-white/[0.04] text-[color:var(--text-secondary)]";
}

function buildSearchText(row: EnrichedRow): string {
    const values = [
        row.formTitle,
        row.submitterAddress ?? "",
        row.metadata.notes,
        row.metadata.tags.join(" "),
        row.analysis?.summary ?? "",
        row.analysis?.topics.join(" ") ?? "",
        ...extractResponsePlainTexts(row.submission, row.formConfig),
    ];
    return values.join(" ").toLowerCase();
}

function previewRow(row: EnrichedRow): string {
    if (!row.isReadable || !row.submission) {
        return row.isEncrypted
            ? "Encrypted submission. Open the drawer to decrypt and review on this device."
            : "Fetching response body from Walrus…";
    }
    const parts = extractResponsePlainTexts(row.submission, row.formConfig).filter(Boolean);
    return parts.slice(0, 2).join(" • ") || "No response content captured.";
}

function extractResponsePlainTexts(
    submission: Submission | null,
    formConfig: FormConfig | null,
): string[] {
    if (!submission) return [];
    return submission.responses.map((response) => {
        const field = formConfig?.fields.find((candidate) => candidate.id === response.fieldId) ?? null;
        const label = field?.label ?? response.fieldId;
        const value = responseValueToText(response.value, field);
        return `${label}: ${value}`;
    });
}

function responseValueToText(
    value: SubmissionResponse["value"],
    field: FormField | null,
): string {
    if (value === null) return "(blank)";
    if (typeof value === "string") {
        if (field?.type === "rich_text") return richTextToPlainText(value) || "(blank)";
        return value;
    }
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return value.filename ?? value.blobId;
}

function toInboxExportRow(row: EnrichedRow): InboxExportRow {
    return {
        formId: row.formId,
        formTitle: row.formTitle,
        submissionBlobId: row.submissionBlobId,
        submittedAt: row.submittedAt,
        submitterAddress: row.submitterAddress,
        isEncrypted: row.isEncrypted,
        isDecrypted: row.isReadable,
        priority: row.priority?.value,
        tags: row.metadata.tags,
        notes: row.metadata.notes,
        aiSummary: row.analysis?.summary,
        aiSentiment: row.analysis?.sentiment,
        aiCategory: row.analysis?.topics[0],
        responses: submissionToRecord(row.submission, row.formConfig),
    };
}

function submissionToRecord(
    submission: Submission | null,
    formConfig: FormConfig | null,
): Record<string, string | string[] | number | boolean> {
    if (!submission) return {};
    const fieldById = new Map(formConfig?.fields.map((field) => [field.id, field]) ?? []);
    const record: Record<string, string | string[] | number | boolean> = {};
    for (const response of submission.responses) {
        const field = fieldById.get(response.fieldId) ?? null;
        const label = field?.label ?? response.fieldId;
        if (response.value === null) {
            record[label] = "";
        } else if (typeof response.value === "string") {
            record[label] = field?.type === "rich_text"
                ? richTextToPlainText(response.value) || ""
                : response.value;
        } else if (Array.isArray(response.value) || typeof response.value === "number" || typeof response.value === "boolean") {
            record[label] = response.value;
        } else {
            record[label] = response.value.filename ?? response.value.blobId;
        }
    }
    return record;
}

function renderSubmissionResponses(
    submission: Submission,
    formConfig: FormConfig | null,
): React.ReactNode {
    const fieldById = new Map(formConfig?.fields.map((field) => [field.id, field]) ?? []);
    return submission.responses.map((response) => {
        const field = fieldById.get(response.fieldId) ?? null;
        const label = field?.label ?? response.fieldId;
        return (
            <div
                key={response.fieldId}
                className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] p-4"
            >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
                    {label}
                </p>
                <div className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
                    <ResponseValue value={response.value} field={field} />
                </div>
            </div>
        );
    });
}

function ResponseValue({
    value,
    field,
}: {
    value: SubmissionResponse["value"];
    field: FormField | null;
}) {
    if (value === null) return <span>(blank)</span>;
    if (typeof value === "string") {
        if (field?.type === "rich_text") {
            const html = sanitizeRichText(value);
            return <div dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <span className="whitespace-pre-wrap">{value}</span>;
    }
    if (Array.isArray(value)) return <span>{value.join(", ")}</span>;
    if (typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
    return <WalrusAttachment value={value} />;
}

function WalrusAttachment({ value }: { value: WalrusBlobRef }) {
    return (
        <a
            href={blobUrl(value.blobId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border-default)] px-3 py-2 text-sm text-[color:var(--brand-secondary)] transition-colors hover:border-[color:var(--brand-secondary)]/40"
        >
            <Icon icon="fluent:document-24-regular" className="h-4 w-4" />
            {value.filename ?? shortBlob(value.blobId)}
        </a>
    );
}

function formatDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatTime(value: string): string {
    return new Date(value).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatDateTime(value: string): string {
    return `${formatDate(value)} ${formatTime(value)}`;
}

function shortBlob(blobId: string): string {
    return blobId.length > 14 ? `${blobId.slice(0, 7)}…${blobId.slice(-5)}` : blobId;
}
