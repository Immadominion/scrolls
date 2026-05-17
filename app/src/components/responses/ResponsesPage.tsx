"use client";

// ─────────────────────────────────────────────────
// Responses viewer for a single form.
//
// Reads the local submission index (Phase 1 — per-browser only) and
// lazily fetches each submission JSON from Walrus on demand. The form
// config itself is also loaded from Walrus so we can render submissions
// against the original field labels.
//
// Phase 2 will replace the local submission index with on-chain
// SubmissionRef objects, making this page work cross-device.
// ─────────────────────────────────────────────────

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import type { AIAnalysis, FormConfig, Submission, SubmissionResponse } from "@/types";
import { fetchJSON, blobUrl } from "@/lib/walrus";
import { listSubmissions, addSubmission, type SubmissionIndexEntry } from "@/lib/submissionIndex";
import { getFormPointer, getSubmissionsForForm, isPointerId } from "@/lib/registry";
import { hasOnchainRegistry } from "@/lib/contracts";
import { truncateAddress } from "@/lib/sui";
import {
    decryptForForm,
    decryptForFormWithCryptoKey,
    isEncryptedEnvelope,
    loadFormPrivateKey,
    parseKeyBackup,
    storeFormPrivateKey,
} from "@/lib/crypto";
import { decryptFromPolicy, isSealEnvelope, type SealEnvelopeV2 } from "@/lib/seal";
import { useScrollsAccount, useScrollsDAppKit } from "@/lib/useScrollsAccount";
import AdminPanel from "./AdminPanel";
import ShareCardModal from "@/components/share/ShareCardModal";
import {
    loadHardenedFormPrivateKey,
    storeHardenedFormPrivateKey,
} from "@/lib/keyStore";
import { sanitizeRichText, richTextToPlainText } from "@/lib/richText"; import { saveAdminMetadata, loadAdminMetadata, type AdminMetadata } from "@/lib/adminMetadata";
import { exportResponsesAsJSON, exportResponsesAsCSV, downloadFile, type ExportableResponse } from "@/lib/exportResponses";
import { verifySubmissionSignature } from "@/lib/submissionAuth";
import {
    analyzeSubmission,
    loadCachedAnalysis,
    clearCachedAnalysis,
    enqueueAnalysis,
    isAIProxyConfigured,
    subscribeAnalysisCompletions,
} from "@/lib/ai-submission-analysis";
import MouseGlow from "@/components/ui/MouseGlow";
import DotGrid from "@/components/ui/DotGrid";
import ThemeToggle from "@/components/theme/ThemeToggle";

const easing = [0.25, 0.4, 0.25, 1] as const;
const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ?? "";
const PRIORITY_WEIGHT: Record<"low" | "medium" | "high" | "critical", number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
};

// ── Row-header chip palette ──────────────────────
const PRIORITY_CHIP: Record<
    "low" | "medium" | "high" | "critical",
    { label: string; bg: string; ring: string; text: string }
> = {
    low: { label: "Low", bg: "bg-[#06b6d4]/10", ring: "border-[#06b6d4]/25", text: "text-[#06b6d4]" },
    medium: { label: "Medium", bg: "bg-[#a78bfa]/10", ring: "border-[#a78bfa]/25", text: "text-[#a78bfa]" },
    high: { label: "High", bg: "bg-amber-400/10", ring: "border-amber-400/25", text: "text-amber-300" },
    critical: { label: "Critical", bg: "bg-red-500/10", ring: "border-red-500/30", text: "text-red-400" },
};

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
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider shrink-0",
                c.bg,
                c.ring,
                c.text,
            )}
            title={fromAi ? `AI suggested: ${c.label}` : `Priority: ${c.label}`}
        >
            {fromAi && (
                <Icon icon="fluent:sparkle-12-regular" className="w-2.5 h-2.5 opacity-80" />
            )}
            {c.label}
        </span>
    );
}

function SentimentChip({ sentiment }: { sentiment: "positive" | "neutral" | "negative" }) {
    const map = {
        positive: { icon: "fluent:emoji-smile-slight-16-regular", text: "text-emerald-400", title: "Positive sentiment" },
        neutral: { icon: "fluent:emoji-meh-16-regular", text: "text-[#a1a1aa]", title: "Neutral sentiment" },
        negative: { icon: "fluent:emoji-sad-16-regular", text: "text-red-400", title: "Negative sentiment" },
    } as const;
    const c = map[sentiment];
    return (
        <span
            className={clsx("inline-flex items-center shrink-0", c.text)}
            title={c.title}
        >
            <Icon icon={c.icon} className="w-3.5 h-3.5" />
        </span>
    );
}

function TopicChip({ topic }: { topic: string }) {
    return (
        <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] text-[10px] text-[color:var(--text-secondary)] truncate max-w-[120px] shrink-0"
            title={topic}
        >
            #{topic.toLowerCase()}
        </span>
    );
}

// Minimal shape we need from the dApp Kit to talk to Seal. Decoupled
// from the full DAppKit type so the helper accepts both the strongly
// typed singleton and the loose useDAppKit() return.
interface DAppKitSealLike {
    signPersonalMessage: (args: { message: Uint8Array }) => Promise<{ signature: string }>;
}

/**
 * Decrypt a raw submission blob into a Submission. Routes through the
 * right path based on the envelope shape:
 *   • v2 Seal envelope    → wallet personal-message → Seal threshold decrypt
 *   • v1 ECIES envelope   → owner ECDH P-256 private key from this browser
 *   • plain Submission     → returned as-is
 * Throws when an envelope can't be decrypted with the available material.
 */
async function decryptToSubmission(
    raw: unknown,
    formId: string,
    dAppKit: DAppKitSealLike | null,
    address: string | null,
): Promise<Submission> {
    if (isSealEnvelope(raw)) {
        if (!dAppKit || !address) {
            throw new Error("Connect the form owner / admin wallet to decrypt.");
        }
        const plaintext = await decryptFromPolicy(raw as SealEnvelopeV2, dAppKit, address);
        return JSON.parse(plaintext) as Submission;
    }
    if (isEncryptedEnvelope(raw)) {
        const hardenedKey = await loadHardenedFormPrivateKey(formId);
        let plaintext: string;
        if (hardenedKey) {
            plaintext = await decryptForFormWithCryptoKey(raw, hardenedKey);
        } else {
            const keyJwk = loadFormPrivateKey(formId);
            if (!keyJwk) throw new Error("No decryption key on this device.");
            plaintext = await decryptForForm(raw, keyJwk);
        }
        return JSON.parse(plaintext) as Submission;
    }
    return raw as Submission;
}

// ── Inner ───────────────────────────────────────────────────────────────

function ResponsesContent() {
    const searchParams = useSearchParams();
    const formId = searchParams.get("id") ?? "";

    const [mounted, setMounted] = useState(false);
    const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [entries, setEntries] = useState<SubmissionIndexEntry[]>([]);
    const [hasPrivateKey, setHasPrivateKey] = useState(false);
    const [keyImportError, setKeyImportError] = useState<string | null>(null);
    const [keyJustImported, setKeyJustImported] = useState(false);
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "priority">("newest");
    const [filterBy, setFilterBy] = useState<string>("all");
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();
    const canDecryptSeal = !!(account?.address && dAppKit);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted || !formId) return;
        setEntries(listSubmissions(formId));
        // Either store counts as "have a key on this device".
        (async () => {
            const hardened = await loadHardenedFormPrivateKey(formId);
            if (hardened) {
                setHasPrivateKey(true);
                return;
            }
            setHasPrivateKey(loadFormPrivateKey(formId) !== null);
        })();
    }, [mounted, formId]);

    useEffect(() => {
        if (!formId) return;
        let cancelled = false;
        (async () => {
            try {
                // The URL `id` may be a Walrus blob id (legacy) or a Sui
                // object id pointing to a `FormPointer`. Resolve pointers
                // to the current blob first so the responses page follows
                // owner edits transparently.
                let blobToFetch = formId;
                let pointerId: string | undefined;
                if (isPointerId(formId)) {
                    const ptr = await getFormPointer(formId);
                    if (ptr) {
                        blobToFetch = ptr.blobId;
                        pointerId = ptr.pointerId;
                    }
                }
                const cfg = await fetchJSON<FormConfig>(blobToFetch);
                if (pointerId && !cfg.pointerId) cfg.pointerId = pointerId;
                if (!cancelled) setFormConfig(cfg);
            } catch (err) {
                if (!cancelled) {
                    setFormError(
                        err instanceof Error ? err.message : "Failed to load form",
                    );
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [formId]);

    // Cross-device discovery: stream `SubmissionRecorded` events for
    // this pointer, merge any new ones into local state, and persist
    // them so the next visit renders instantly. Best-effort — silently
    // falls back to local-only when the registry isn't deployed.
    useEffect(() => {
        if (!mounted || !formId || !hasOnchainRegistry()) return;
        if (!isPointerId(formId)) return;
        let cancelled = false;
        (async () => {
            try {
                const onchain = await getSubmissionsForForm(formId);
                if (cancelled || onchain.length === 0) return;
                const known = new Set(
                    listSubmissions(formId).map((s) => s.submissionBlobId),
                );
                let added = 0;
                for (const sub of onchain) {
                    if (known.has(sub.blobId)) continue;
                    addSubmission(formId, {
                        submissionBlobId: sub.blobId,
                        submittedAt: new Date(sub.submittedAtMs).toISOString(),
                        submitterAddress: sub.submitter,
                        // We don't know these flags from the event alone
                        // — the per-row decrypt path will detect envelope
                        // shape when fetching the blob.
                        isEncrypted: false,
                        isSigned: false,
                    });
                    added += 1;
                }
                if (added > 0) setEntries(listSubmissions(formId));
            } catch {
                // Silent fallback.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mounted, formId]);

    const isEncryptedForm = !!formConfig?.encryptionPublicKey;
    const needsKeyRestore = isEncryptedForm && mounted && !hasPrivateKey;

    // Collect all tags currently in use across this form's submissions
    // so the filter dropdown can offer them dynamically.
    const availableTags = useMemo(() => {
        if (!formId) return [] as string[];
        const all = new Set<string>();
        for (const entry of entries) {
            const md = loadAdminMetadata(formId, entry.submissionBlobId);
            for (const t of md.tags) all.add(t);
        }
        return Array.from(all).sort();
    }, [entries, formId]);

    const visibleEntries = useMemo(() => {
        if (!formId) return [] as SubmissionIndexEntry[];
        const next = [...entries];

        const filtered = next.filter((entry) => {
            if (filterBy === "all") return true;
            if (filterBy === "encrypted") return entry.isEncrypted;
            if (filterBy === "public") return !entry.isEncrypted;
            // "decrypted" → row is encrypted AND we have a path to read it
            // (legacy ECIES key on this device OR a connected wallet that
            // can sign a Seal SessionKey). "locked" → the inverse.
            if (filterBy === "decrypted")
                return entry.isEncrypted && (hasPrivateKey || canDecryptSeal);
            if (filterBy === "locked")
                return entry.isEncrypted && !hasPrivateKey && !canDecryptSeal;
            const metadata = loadAdminMetadata(formId, entry.submissionBlobId);
            if (filterBy.startsWith("tag:")) {
                return metadata.tags.includes(filterBy.slice(4));
            }
            return metadata.priority === filterBy;
        });

        filtered.sort((a, b) => {
            if (sortBy === "newest") {
                return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
            }
            if (sortBy === "oldest") {
                return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
            }

            const aPriority = PRIORITY_WEIGHT[loadAdminMetadata(formId, a.submissionBlobId).priority];
            const bPriority = PRIORITY_WEIGHT[loadAdminMetadata(formId, b.submissionBlobId).priority];
            if (bPriority !== aPriority) return bPriority - aPriority;
            return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
        });

        return filtered;
    }, [entries, filterBy, formId, sortBy, hasPrivateKey, canDecryptSeal]);

    if (!formId) {
        return (
            <ErrorState
                title="No form ID"
                detail="Missing ?id=<formId> in the URL."
            />
        );
    }

    if (formError) {
        return <ErrorState title="Could not load form" detail={formError} />;
    }

    const onPickKeyFile = () => {
        setKeyImportError(null);
        fileInputRef.current?.click();
    };

    const onKeyFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-picking the same file
        if (!file) return;
        try {
            const text = await file.text();
            const jwk = parseKeyBackup(text, formId);
            // Try to store as a hardened, non-extractable CryptoKey in
            // IndexedDB. If that succeeds the JWK never touches
            // localStorage. Fall back to the legacy JWK path if IDB or
            // WebCrypto are unavailable.
            const hardened = await storeHardenedFormPrivateKey(formId, jwk);
            if (!hardened) storeFormPrivateKey(formId, jwk);
            setHasPrivateKey(true);
            setKeyJustImported(true);
            setTimeout(() => setKeyJustImported(false), 2200);
        } catch (err) {
            setKeyImportError(err instanceof Error ? err.message : "Failed to import key.");
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-6 py-12 relative z-10">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: easing }}
                className="mb-10"
            >
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)] transition-colors mb-6"
                >
                    <Icon icon="fluent:arrow-left-24-regular" className="w-3.5 h-3.5" />
                    Back to dashboard
                </Link>

                <div className="flex items-start justify-between gap-6 flex-wrap">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">
                            Responses
                        </p>
                        <h1 className="text-3xl sm:text-4xl font-display font-bold text-[color:var(--text-primary)] tracking-tight leading-[1.1]">
                            {formConfig?.title ?? <SkeletonLine width="14rem" />}
                        </h1>
                        <p className="text-[11px] text-[color:var(--text-soft)] mt-3 font-mono truncate">
                            {formId}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <ThemeToggle />
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-full bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-secondary)]">
                                <span className="text-[color:var(--text-primary)] font-semibold">{entries.length}</span>{" "}
                                {entries.length === 1 ? "response" : "responses"}
                            </span>
                            {formConfig?.settings.isPrivate && (
                                <span className="px-3 py-1.5 rounded-full bg-[#06b6d4]/10 border border-[#06b6d4]/25 text-xs text-[#06b6d4] inline-flex items-center gap-1.5">
                                    <Icon icon="fluent:lock-closed-12-regular" className="w-3 h-3" />
                                    {hasPrivateKey || !isEncryptedForm ? "E2E encrypted" : "Key needed"}
                                </span>
                            )}
                            {formConfig?.policyId && (
                                <button
                                    onClick={() => setShowAdminPanel(true)}
                                    className="px-3 py-1.5 rounded-full bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-default)] inline-flex items-center gap-1.5 transition-colors"
                                    title="Manage decryption admins"
                                >
                                    <Icon icon="fluent:people-team-24-regular" className="w-3.5 h-3.5" />
                                    Admins
                                </button>
                            )}
                            <button
                                onClick={() => setShareOpen(true)}
                                disabled={!formConfig}
                                className="px-3 py-1.5 rounded-full bg-[#a78bfa]/10 border border-[#a78bfa]/30 text-xs text-[#a78bfa] hover:bg-[#a78bfa]/15 hover:border-[#a78bfa]/50 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                title="Share card & QR"
                            >
                                <Icon icon="fluent:qr-code-24-regular" className="w-3.5 h-3.5" />
                                Share
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Key restore banner — shown when this browser doesn't hold
                the form's private key (e.g. owner switched devices). */}
            {needsKeyRestore && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: easing }}
                    className="mb-8 p-4 rounded-xl border border-[#06b6d4]/25 bg-[#06b6d4]/5"
                >
                    <div className="flex items-start gap-3">
                        <Icon
                            icon="fluent:key-24-regular"
                            className="w-5 h-5 text-[#06b6d4] mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[color:var(--text-primary)]">
                                Decryption key not on this device
                            </p>
                            <p className="text-xs text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                                Responses are end-to-end encrypted. Import the
                                key backup file you downloaded when you published
                                this form.
                            </p>
                            {keyImportError && (
                                <p className="text-xs text-red-400 mt-2">{keyImportError}</p>
                            )}
                            <div className="mt-3">
                                <button
                                    onClick={onPickKeyFile}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#06b6d4] text-[#0a0a0a] hover:bg-[#22d3ee] transition-colors"
                                >
                                    <Icon icon="fluent:arrow-upload-24-regular" className="w-3.5 h-3.5" />
                                    Import key backup
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/json,.json"
                                    onChange={onKeyFileChosen}
                                    className="hidden"
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {keyJustImported && (
                <p className="mb-4 text-xs text-[#06b6d4] inline-flex items-center gap-1.5">
                    <Icon icon="fluent:checkmark-12-regular" className="w-3 h-3" />
                    Key imported — expand a row to decrypt.
                </p>
            )}

            {mounted && entries.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                        <span>Sort</span>
                        <select
                            value={sortBy}
                            onChange={(e) =>
                                setSortBy(e.target.value as "newest" | "oldest" | "priority")
                            }
                            className="bg-[color:var(--surface-panel)] border border-[color:var(--border-default)] rounded-md px-2 py-1 text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[#a78bfa]"
                        >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                            <option value="priority">Priority</option>
                        </select>
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                        <span>Filter</span>
                        <select
                            value={filterBy}
                            onChange={(e) => setFilterBy(e.target.value)}
                            className="bg-[color:var(--surface-panel)] border border-[color:var(--border-default)] rounded-md px-2 py-1 text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[#a78bfa]"
                        >
                            <option value="all">All</option>
                            <option value="encrypted">Encrypted</option>
                            <option value="public">Public</option>
                            <option value="decrypted">Decrypted</option>
                            <option value="locked">Locked</option>
                            <option value="critical">Critical priority</option>
                            <option value="high">High priority</option>
                            <option value="medium">Medium priority</option>
                            <option value="low">Low priority</option>
                            {availableTags.length > 0 && (
                                <optgroup label="Tags">
                                    {availableTags.map((tag) => (
                                        <option key={tag} value={`tag:${tag}`}>
                                            #{tag}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </label>

                    <span className="text-xs text-[color:var(--text-muted)]">
                        Showing {visibleEntries.length} of {entries.length}
                    </span>
                </div>
            )}

            {/* Export buttons */}
            {mounted && entries.length > 0 && formConfig && (
                <div className="mb-6 flex gap-2">
                    <ExportButton
                        formId={formId}
                        formConfig={formConfig}
                        entries={entries}
                        hasPrivateKey={hasPrivateKey}
                        format="json"
                    />
                    <ExportButton
                        formId={formId}
                        formConfig={formConfig}
                        entries={entries}
                        hasPrivateKey={hasPrivateKey}
                        format="csv"
                    />
                </div>
            )}

            {/* Aggregate insights — sentiment, priority, top topics across all submissions. */}
            {mounted && entries.length > 0 && formConfig && (
                <InsightsPanel
                    entries={entries}
                    formConfig={formConfig}
                    formId={formId}
                    hasPrivateKey={hasPrivateKey}
                />
            )}

            {!mounted ? (
                <ListSkeleton />
            ) : entries.length === 0 ? (
                <EmptyResponses />
            ) : visibleEntries.length === 0 ? (
                <div className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] p-6 text-sm text-[color:var(--text-secondary)]">
                    No responses match the selected filter.
                </div>
            ) : (
                <ul className="space-y-3">
                    {visibleEntries.map((entry, i) => (
                        <motion.li
                            key={entry.submissionBlobId}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: i * 0.04, ease: easing }}
                        >
                            <ResponseRow
                                entry={entry}
                                formId={formId}
                                formConfig={formConfig}
                                hasPrivateKey={hasPrivateKey}
                            />
                        </motion.li>
                    ))}
                </ul>
            )}

            <p className="text-[10px] text-[color:var(--text-soft)] mt-10 leading-relaxed max-w-md">
                Response indexes on this device are browser-local. Connecting the same wallet on another device starts a fresh list.
            </p>

            {showAdminPanel && formConfig?.policyId && (
                <AdminPanel
                    policyId={formConfig.policyId}
                    onClose={() => setShowAdminPanel(false)}
                />
            )}

            <AnimatePresence>
                {shareOpen && formConfig && (
                    <ShareCardModal
                        title={formConfig.title || "Untitled form"}
                        canonicalUrl={
                            typeof window !== "undefined"
                                ? `${window.location.origin}/f?id=${formId}`
                                : `/f?id=${formId}`
                        }
                        isPrivate={formConfig.settings.isPrivate}
                        blobId={formConfig.walrusBlobId ?? formId}
                        onClose={() => setShareOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Single response row (lazy-loads body on expand) ────────────────────

function ResponseRow({
    entry,
    formId,
    formConfig,
    hasPrivateKey,
}: {
    entry: SubmissionIndexEntry;
    formId: string;
    formConfig: FormConfig | null;
    hasPrivateKey: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [decryptionError, setDecryptionError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [sigStatus, setSigStatus] = useState<"none" | "verifying" | "valid" | "invalid">("none");
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();

    const submittedAt = useMemo(() => new Date(entry.submittedAt), [entry.submittedAt]);
    const dateLabel = submittedAt.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const submitterLabel = entry.submitterAddress
        ? truncateAddress(entry.submitterAddress)
        : "Anonymous";

    const aggregatorUrl = `${aggregator}/v1/blobs/${entry.submissionBlobId}`;
    const [linkCopied, setLinkCopied] = useState(false);

    // Live admin metadata (priority/tags) and any cached AI analysis
    // — both drive the row-header chips below. We re-read on mount
    // so the chip reflects edits made in other tabs / panels.
    const [meta, setMeta] = useState<AdminMetadata | null>(null);
    const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
    useEffect(() => {
        setMeta(loadAdminMetadata(formId, entry.submissionBlobId));
        setAnalysis(loadCachedAnalysis(entry.submissionBlobId));
    }, [formId, entry.submissionBlobId, submission]);
    useEffect(() => {
        // Pick up async analysis completions kicked off by the AI panel.
        return subscribeAnalysisCompletions((blobId, a) => {
            if (blobId === entry.submissionBlobId && a) setAnalysis(a);
        });
    }, [entry.submissionBlobId]);

    // Effective priority: an explicit admin override (anything other than
    // the default "medium") wins over the AI suggestion. We treat the
    // default "medium" as "unset" so AI can fill in.
    const adminPriority = meta?.priority;
    const adminOverridden = !!adminPriority && adminPriority !== "medium";
    const effectivePriority = adminOverridden
        ? adminPriority
        : analysis?.suggestedPriority ?? adminPriority ?? null;

    const onCopyLink = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(aggregatorUrl);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 1600);
        } catch {
            /* clipboard blocked */
        }
    };

    const onToggle = async () => {
        const next = !expanded;
        setExpanded(next);
        if (next && !submission && !loading) {
            setLoading(true);
            setLoadError(null);
            setDecryptionError(null);
            try {
                const raw = await fetchJSON<unknown>(entry.submissionBlobId);
                // Encrypted submissions: v2 (Seal) routes through wallet
                // personal-message + Seal threshold decrypt; v1 (legacy
                // ECIES) uses the owner's private key cached in this
                // browser — keyed by the form's Walrus blob id which
                // matches `formId` from the URL.
                const parsed = await decryptToSubmission(raw, formId, dAppKit, account?.address ?? null);
                setSubmission(parsed);

                // Verify wallet attestation if present.
                if (parsed.signature) {
                    setSigStatus("verifying");
                    const ok = await verifySubmissionSignature(formId, parsed.signature);
                    setSigStatus(ok ? "valid" : "invalid");
                } else {
                    setSigStatus("none");
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to fetch from Walrus";
                if (entry.isEncrypted) setDecryptionError(msg);
                else setLoadError(msg);
            } finally {
                setLoading(false);
            }
        }
    };

    const onCopyId = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(entry.submissionBlobId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard blocked */
        }
    };

    return (
        <div className="overflow-hidden rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] backdrop-blur-sm">
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center gap-4 p-4 text-left transition-colors hover:bg-[color:var(--background-subtle)]"
            >
                <span
                    className={clsx(
                        "shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-colors",
                        entry.isEncrypted
                            ? "border-[#06b6d4]/25 bg-[#06b6d4]/10 text-[#06b6d4]"
                            : "border-[#a78bfa]/15 bg-[#a78bfa]/5 text-[#a78bfa]",
                    )}
                >
                    <Icon
                        icon={
                            entry.isEncrypted
                                ? "fluent:lock-closed-24-regular"
                                : "fluent:document-text-24-regular"
                        }
                        className="w-4 h-4"
                    />
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">
                            {submitterLabel}
                        </p>
                        {effectivePriority && (
                            <PriorityChip
                                priority={effectivePriority}
                                fromAi={!adminOverridden && !!analysis}
                            />
                        )}
                        {analysis?.sentiment && (
                            <SentimentChip sentiment={analysis.sentiment} />
                        )}
                        {analysis?.topics?.[0] && (
                            <TopicChip topic={analysis.topics[0]} />
                        )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[color:var(--text-secondary)]">
                        {dateLabel}
                        <span className="mx-1.5 text-[color:var(--border-strong)]">·</span>
                        <span className="font-mono">
                            {entry.submissionBlobId.slice(0, 8)}…{entry.submissionBlobId.slice(-6)}
                        </span>
                    </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <span
                        onClick={onCopyId}
                        role="button"
                        tabIndex={0}
                        className="rounded-md p-1.5 text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)]"
                        aria-label="Copy receipt"
                        title="Copy receipt id"
                    >
                        <Icon
                            icon={copied ? "fluent:checkmark-12-regular" : "fluent:copy-24-regular"}
                            className="w-3.5 h-3.5"
                        />
                    </span>
                    <span
                        onClick={onCopyLink}
                        role="button"
                        tabIndex={0}
                        className="rounded-md p-1.5 text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)]"
                        aria-label="Copy submission link"
                        title="Copy submission link"
                    >
                        <Icon
                            icon={linkCopied ? "fluent:checkmark-12-regular" : "fluent:link-24-regular"}
                            className="w-3.5 h-3.5"
                        />
                    </span>
                    <a
                        href={aggregatorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-md p-1.5 text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)]"
                        aria-label="Open on Walrus"
                        title="Open on Walrus"
                    >
                        <Icon icon="fluent:open-24-regular" className="w-3.5 h-3.5" />
                    </a>
                    <Icon
                        icon="fluent:chevron-down-24-regular"
                        className={clsx(
                            "ml-1 h-4 w-4 text-[color:var(--text-secondary)] transition-transform duration-200",
                            expanded && "rotate-180",
                        )}
                    />
                </div>
            </button>

            <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
            >
                <div className="overflow-hidden">
                    <div className="border-t border-[color:var(--border-subtle)] px-4 pb-4 pt-1">
                        {loading && (
                            <p className="inline-flex items-center gap-2 py-3 text-xs text-[color:var(--text-secondary)]">
                                <Icon
                                    icon="fluent:spinner-ios-20-regular"
                                    className="w-3.5 h-3.5 animate-spin"
                                />
                                Fetching from Walrus…
                            </p>
                        )}
                        {loadError && (
                            <p className="text-xs text-red-400 py-3">{loadError}</p>
                        )}
                        {decryptionError && (
                            <div className="text-xs py-3">
                                <p className="text-red-400">Could not decrypt: {decryptionError}</p>
                                {!hasPrivateKey && (
                                    <p className="mt-1 text-[color:var(--text-secondary)]">
                                        Import the key backup at the top of this page.
                                    </p>
                                )}
                            </div>
                        )}
                        {entry.isEncrypted && submission && (
                            <p className="text-[11px] text-[#06b6d4] mb-3 inline-flex items-center gap-1.5">
                                <Icon icon="fluent:lock-closed-12-regular" className="w-3 h-3" />
                                Decrypted locally — plaintext never leaves your browser.
                            </p>
                        )}
                        {submission && (
                            <>
                                <SignatureBadge sigStatus={sigStatus} address={submission.signature?.address} />
                                <ResponseBody submission={submission} formConfig={formConfig} />
                                {formConfig && (
                                    <AIAnalysisPanel
                                        submission={submission}
                                        formConfig={formConfig}
                                        submissionBlobId={entry.submissionBlobId}
                                    />
                                )}
                                <AdminMetadataEditor formId={formId} submissionBlobId={entry.submissionBlobId} />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ResponseBody({
    submission,
    formConfig,
}: {
    submission: Submission;
    formConfig: FormConfig | null;
}) {
    const fieldFor = (fieldId: string) =>
        formConfig?.fields.find((f) => f.id === fieldId);

    return (
        <dl className="space-y-3 mt-2">
            {submission.responses.map((r) => {
                const field = fieldFor(r.fieldId);
                const label = field?.label ?? r.fieldId;
                return (
                    <div key={r.fieldId}>
                        <dt className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                            {label}
                        </dt>
                        <dd className="break-words whitespace-pre-wrap text-sm text-[color:var(--text-primary)]">
                            {field?.type === "rich_text" && typeof r.value === "string"
                                ? <RichTextValue html={r.value} />
                                : renderValue(r.value)}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

function RichTextValue({ html }: { html: string }) {
    if (!html || html.trim() === "") {
        return <span className="italic text-[color:var(--text-soft)]">—</span>;
    }
    // Sanitize on the client before injecting. This is the only place
    // in the app that ever calls dangerouslySetInnerHTML, and the input
    // is always run through DOMPurify with a strict allowlist first.
    const safe = sanitizeRichText(html);
    return (
        <div
            className="tiptap-content max-w-none text-sm text-[color:var(--text-primary)]"
            dangerouslySetInnerHTML={{ __html: safe }}
        />
    );
}

function renderValue(value: SubmissionResponse["value"]) {
    if (value === null || value === undefined || value === "") {
        return <span className="italic text-[color:var(--text-soft)]">—</span>;
    }
    if (Array.isArray(value)) {
        return value.length === 0
            ? <span className="italic text-[color:var(--text-soft)]">—</span>
            : value.join(", ");
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value;
    // WalrusBlobRef — file/video upload
    const url = `${aggregator}/v1/blobs/${value.blobId}`;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[color:var(--brand-primary)] hover:underline"
        >
            <Icon icon="fluent:document-24-regular" className="w-3.5 h-3.5" />
            {value.filename ?? "attachment"}
            <span className="text-[10px] text-[color:var(--text-secondary)]">
                ({Math.ceil(value.sizeBytes / 1024)} KB)
            </span>
        </a>
    );
}

// ── Empty + skeleton + error ────────────────────────────────────────────

function AIAnalysisPanel({
    submission,
    formConfig,
    submissionBlobId,
}: {
    submission: Submission;
    formConfig: FormConfig;
    submissionBlobId: string;
}) {
    const [analysis, setAnalysis] = useState<AIAnalysis | null>(() =>
        loadCachedAnalysis(submissionBlobId),
    );
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const proxyConfigured = isAIProxyConfigured();

    // Auto-trigger analysis the first time we have a decrypted
    // submission and no cached result. The shared queue dedupes by blob
    // ID and caps concurrency, so this is safe to call from every row.
    useEffect(() => {
        if (!proxyConfigured) return;
        if (analysis) return;
        let cancelled = false;
        setRunning(true);
        enqueueAnalysis(submission, formConfig, submissionBlobId).then((result) => {
            if (cancelled) return;
            setRunning(false);
            if (result) setAnalysis(result);
        });
        return () => {
            cancelled = true;
        };
        // Only re-run when the row's identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionBlobId]);

    const onRun = async () => {
        setRunning(true);
        setError(null);
        try {
            const result = await analyzeSubmission(submission, formConfig, submissionBlobId);
            setAnalysis(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed.");
        } finally {
            setRunning(false);
        }
    };

    const onClear = () => {
        clearCachedAnalysis(submissionBlobId);
        setAnalysis(null);
        setError(null);
    };

    if (!proxyConfigured) return null;

    const sentimentColor =
        analysis?.sentiment === "positive"
            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
            : analysis?.sentiment === "negative"
                ? "text-red-400 border-red-500/30 bg-red-500/5"
                : "text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)]";
    const priorityColor =
        analysis?.suggestedPriority === "critical"
            ? "text-red-400 border-red-500/30 bg-red-500/5"
            : analysis?.suggestedPriority === "high"
                ? "text-orange-400 border-orange-500/30 bg-orange-500/5"
                : analysis?.suggestedPriority === "medium"
                    ? "text-[#a78bfa] border-[#a78bfa]/30 bg-[#a78bfa]/5"
                    : "text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)]";

    return (
        <div className="mt-4 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] px-4 py-3">
            <div className="flex items-center justify-between mb-2">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--text-primary)]">
                    <Icon icon="fluent:sparkle-24-regular" className="w-3.5 h-3.5 text-[#a78bfa]" />
                    AI triage
                </p>
                <div className="flex items-center gap-2">
                    {analysis && !running && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="text-[10px] text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--text-primary)]"
                        >
                            Clear
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onRun}
                        disabled={running}
                        className="inline-flex items-center gap-1.5 rounded border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] transition-colors hover:border-[#a78bfa]/40 hover:bg-[color:var(--background-subtle)] disabled:opacity-50"
                    >
                        {running ? (
                            <>
                                <Icon icon="fluent:spinner-ios-20-regular" className="w-3 h-3 animate-spin" />
                                Analyzing…
                            </>
                        ) : analysis ? (
                            "Re-run"
                        ) : (
                            "Analyze with Claude"
                        )}
                    </button>
                </div>
            </div>
            {error && (
                <p className="text-[11px] text-red-400 mb-2">{error}</p>
            )}
            {analysis && (
                <div className="space-y-2">
                    <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">{analysis.summary}</p>
                    <div className="flex flex-wrap gap-1.5">
                        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border", sentimentColor)}>
                            {analysis.sentiment} · {(analysis.sentimentScore * 100).toFixed(0)}%
                        </span>
                        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border", priorityColor)}>
                            priority: {analysis.suggestedPriority}
                        </span>
                        {analysis.topics.map((t) => (
                            <span
                                key={t}
                                className="rounded border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
                            >
                                #{t}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SignatureBadge({
    sigStatus,
    address,
}: {
    sigStatus: "none" | "verifying" | "valid" | "invalid";
    address?: string;
}) {
    if (sigStatus === "none") return null;
    const truncated = address
        ? `${address.slice(0, 6)}…${address.slice(-4)}`
        : "";
    if (sigStatus === "verifying") {
        return (
            <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-[color:var(--text-secondary)]">
                <Icon icon="fluent:spinner-ios-20-regular" className="w-3 h-3 animate-spin" />
                Verifying wallet signature…
            </p>
        );
    }
    if (sigStatus === "valid") {
        return (
            <p className="text-[11px] text-emerald-400 mb-3 inline-flex items-center gap-1.5">
                <Icon icon="fluent:shield-checkmark-24-regular" className="w-3 h-3" />
                Signed by{" "}
                <span className="font-mono text-emerald-300">{truncated}</span>
                <span className="text-[color:var(--text-secondary)]">· verified on-chain</span>
            </p>
        );
    }
    return (
        <p className="text-[11px] text-red-400 mb-3 inline-flex items-center gap-1.5">
            <Icon icon="fluent:shield-prohibited-24-regular" className="w-3 h-3" />
            Signature did not verify — treat the claimed sender as unverified.
        </p>
    );
}

function EmptyResponses() {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-panel)] py-20 text-center">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <Icon icon="fluent:mail-inbox-24-regular" className="h-5 w-5 text-[color:var(--text-secondary)]" />
            </div>
            <p className="mb-1 text-base font-display font-semibold text-[color:var(--text-primary)]">
                No responses yet
            </p>
            <p className="max-w-xs text-sm text-[color:var(--text-secondary)]">
                Share the form link — every response will appear here, fetched
                directly from Walrus.
            </p>
        </div>
    );
}

// ── Aggregate insights panel ────────────────────────────────────────────
//
// Rolls up cached AI analyses into a single dashboard: sentiment
// distribution, priority counts, and the top 5 topics across all
// submissions for this form. The "Analyze N more" button fetches and
// decrypts each missing submission sequentially and runs Claude Haiku
// over it, caching the result in localStorage so reloads are free.

function InsightsPanel({
    entries,
    formConfig,
    formId,
    hasPrivateKey,
}: {
    entries: SubmissionIndexEntry[];
    formConfig: FormConfig;
    formId: string;
    hasPrivateKey: boolean;
}) {
    const proxyConfigured = isAIProxyConfigured();
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();
    const [analyses, setAnalyses] = useState<Map<string, AIAnalysis>>(() => new Map());
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);

    // Hydrate from localStorage cache whenever the entry list changes.
    useEffect(() => {
        const next = new Map<string, AIAnalysis>();
        for (const e of entries) {
            const cached = loadCachedAnalysis(e.submissionBlobId);
            if (cached) next.set(e.submissionBlobId, cached);
        }
        setAnalyses(next);
    }, [entries]);

    // Live-merge results from the shared queue (per-row auto-analysis).
    useEffect(() => {
        const entryIds = new Set(entries.map((e) => e.submissionBlobId));
        return subscribeAnalysisCompletions((blobId, analysis) => {
            if (!analysis) return;
            if (!entryIds.has(blobId)) return;
            setAnalyses((prev) => {
                if (prev.has(blobId)) return prev;
                const next = new Map(prev);
                next.set(blobId, analysis);
                return next;
            });
        });
    }, [entries]);

    // Entries we can actually analyze: not yet cached, and either public,
    // or v1 (we hold the local key), or v2 Seal (an admin/owner wallet is
    // connected so the runtime can pop a personal-message prompt once).
    const canDecryptSeal = !!(account?.address && dAppKit);
    const analyzableMissing = useMemo(
        () =>
            entries.filter(
                (e) =>
                    !analyses.has(e.submissionBlobId) &&
                    (!e.isEncrypted || hasPrivateKey || canDecryptSeal),
            ),
        [entries, analyses, hasPrivateKey, canDecryptSeal],
    );

    const stats = useMemo(() => {
        const sentiment = { positive: 0, neutral: 0, negative: 0 };
        const priority = { critical: 0, high: 0, medium: 0, low: 0 };
        const topicCounts = new Map<string, number>();
        for (const a of analyses.values()) {
            sentiment[a.sentiment] += 1;
            priority[a.suggestedPriority] += 1;
            for (const t of a.topics) {
                const k = t.trim().toLowerCase();
                if (!k) continue;
                topicCounts.set(k, (topicCounts.get(k) ?? 0) + 1);
            }
        }
        const topTopics = Array.from(topicCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        return { sentiment, priority, topTopics, total: analyses.size };
    }, [analyses]);

    async function runBatch() {
        if (running || analyzableMissing.length === 0) return;
        setRunning(true);
        setError(null);
        setProgress({ done: 0, total: analyzableMissing.length });

        for (let i = 0; i < analyzableMissing.length; i += 1) {
            const entry = analyzableMissing[i];
            try {
                const raw = await fetchJSON<unknown>(entry.submissionBlobId);
                // Routes v2 (Seal, wallet popup once per session) and v1
                // (in-browser ECDH key) through one path. Seal's session
                // key cache means subsequent rows reuse the signature.
                const submission = await decryptToSubmission(
                    raw,
                    formId,
                    dAppKit,
                    account?.address ?? null,
                );

                const result = await analyzeSubmission(submission, formConfig, entry.submissionBlobId);
                setAnalyses((prev) => {
                    const next = new Map(prev);
                    next.set(entry.submissionBlobId, result);
                    return next;
                });
            } catch (err) {
                // Surface the first failure but keep going so a single
                // bad row doesn't poison the whole batch.
                if (!error) {
                    setError(err instanceof Error ? err.message : "Analysis failed for one or more rows.");
                }
            } finally {
                setProgress((p) => ({ done: p.done + 1, total: p.total }));
            }
        }

        setRunning(false);
    }

    const analyzedShare = entries.length > 0 ? Math.round((stats.total / entries.length) * 100) : 0;

    return (
        <div className="mb-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel-strong)]">
            <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#a78bfa]/10 border border-[#a78bfa]/20 text-[#a78bfa] shrink-0">
                        <Icon icon="fluent:chart-multiple-24-regular" className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-display font-semibold text-[color:var(--text-primary)]">
                            Aggregate insights
                        </p>
                        <p className="mt-0.5 text-[11px] text-[color:var(--text-secondary)]">
                            {stats.total === 0
                                ? `${entries.length} response${entries.length === 1 ? "" : "s"} · none analyzed yet`
                                : `${stats.total} of ${entries.length} analyzed (${analyzedShare}%)`}
                        </p>
                    </div>
                </div>
                <Icon
                    icon={collapsed ? "fluent:chevron-down-12-regular" : "fluent:chevron-up-12-regular"}
                    className="h-4 w-4 shrink-0 text-[color:var(--text-secondary)]"
                />
            </button>

            {!collapsed && (
                <div className="border-t border-[color:var(--border-subtle)] px-5 pb-5 pt-1">
                    {/* Run-batch controls */}
                    {proxyConfigured && analyzableMissing.length > 0 && (
                        <div className="mb-4 flex flex-wrap items-center gap-3 pt-4">
                            <button
                                type="button"
                                onClick={runBatch}
                                disabled={running}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#a78bfa] text-[#0a0a0a] hover:bg-[#c4b5fd] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Icon
                                    icon={running ? "fluent:spinner-ios-20-regular" : "fluent:sparkle-24-regular"}
                                    className={clsx("w-3.5 h-3.5", running && "animate-spin")}
                                />
                                {running
                                    ? `Analyzing ${progress.done}/${progress.total}…`
                                    : `Analyze ${analyzableMissing.length} more with Claude`}
                            </button>
                            {error && <span className="text-[11px] text-red-400">{error}</span>}
                        </div>
                    )}
                    {!proxyConfigured && (
                        <p className="pt-4 text-[11px] text-[color:var(--text-secondary)]">
                            Set <code className="text-[#a78bfa]">NEXT_PUBLIC_AI_PROXY_URL</code> to enable
                            Claude-powered batch analysis.
                        </p>
                    )}

                    {stats.total === 0 ? (
                        <p className="pt-2 text-xs text-[color:var(--text-secondary)]">
                            Run analysis to see sentiment, priority, and topic rollups across all submissions.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                            {/* Sentiment */}
                            <div>
                                <p className="mb-2 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                                    Sentiment
                                </p>
                                <DistributionBar
                                    segments={[
                                        { label: "Positive", value: stats.sentiment.positive, color: "#10b981" },
                                        { label: "Neutral", value: stats.sentiment.neutral, color: "#52525b" },
                                        { label: "Negative", value: stats.sentiment.negative, color: "#ef4444" },
                                    ]}
                                    total={stats.total}
                                />
                            </div>

                            {/* Priority */}
                            <div>
                                <p className="mb-2 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                                    Suggested priority
                                </p>
                                <DistributionBar
                                    segments={[
                                        { label: "Critical", value: stats.priority.critical, color: "#ef4444" },
                                        { label: "High", value: stats.priority.high, color: "#f97316" },
                                        { label: "Medium", value: stats.priority.medium, color: "#a78bfa" },
                                        { label: "Low", value: stats.priority.low, color: "#52525b" },
                                    ]}
                                    total={stats.total}
                                />
                            </div>

                            {/* Top topics */}
                            <div>
                                <p className="mb-2 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                                    Top topics
                                </p>
                                {stats.topTopics.length === 0 ? (
                                    <p className="text-[11px] text-[color:var(--text-soft)]">No topics extracted yet.</p>
                                ) : (
                                    <ul className="flex flex-wrap gap-1.5">
                                        {stats.topTopics.map(([topic, count]) => (
                                            <li
                                                key={topic}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] px-2 py-0.5 text-[11px] text-[color:var(--text-secondary)]"
                                            >
                                                <span className="text-[color:var(--text-primary)]">{topic}</span>
                                                <span className="text-[color:var(--text-secondary)]">×{count}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function DistributionBar({
    segments,
    total,
}: {
    segments: Array<{ label: string; value: number; color: string }>;
    total: number;
}) {
    return (
        <div>
            <div className="flex h-2 w-full overflow-hidden rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)]">
                {segments.map((s) =>
                    s.value > 0 ? (
                        <div
                            key={s.label}
                            className="h-full"
                            style={{
                                width: `${(s.value / total) * 100}%`,
                                backgroundColor: s.color,
                            }}
                            title={`${s.label}: ${s.value}`}
                        />
                    ) : null,
                )}
            </div>
            <ul className="mt-2 space-y-0.5">
                {segments
                    .filter((s) => s.value > 0)
                    .map((s) => (
                        <li
                            key={s.label}
                            className="flex items-center justify-between text-[11px]"
                        >
                            <span className="inline-flex items-center gap-1.5 text-[color:var(--text-secondary)]">
                                <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: s.color }}
                                />
                                {s.label}
                            </span>
                            <span className="font-mono text-[color:var(--text-primary)]">{s.value}</span>
                        </li>
                    ))}
            </ul>
        </div>
    );
}

function ListSkeleton() {
    return (
        <ul className="space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
                <li
                    key={i}
                    className="h-16 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)]"
                />
            ))}
        </ul>
    );
}

function SkeletonLine({ width = "10rem" }: { width?: string }) {
    return (
        <span
            className="inline-block h-7 animate-pulse rounded-md bg-[color:var(--background-subtle)] align-middle"
            style={{ width }}
        />
    );
}

function ErrorState({ title, detail }: { title: string; detail: string }) {
    return (
        <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] px-6 text-center relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                <Icon icon="fluent:dismiss-circle-24-regular" className="w-7 h-7 text-red-400" />
            </div>
            <p className="mb-2 font-semibold text-[color:var(--text-primary)]">{title}</p>
            <p className="text-sm text-[color:var(--text-secondary)]">{detail}</p>
            <Link
                href="/dashboard"
                className="mt-6 text-xs text-[color:var(--brand-primary)] hover:underline"
            >
                Back to dashboard
            </Link>
        </div>
    );
}

// ── Admin metadata editor (notes + priority) ─────────────────────────────

interface AdminMetadataEditorProps {
    formId: string;
    submissionBlobId: string;
}

function AdminMetadataEditor({ formId, submissionBlobId }: AdminMetadataEditorProps) {
    const [metadata, setMetadata] = useState(() =>
        loadAdminMetadata(formId, submissionBlobId),
    );
    const [tagInput, setTagInput] = useState("");

    const handleNotesChange = (notes: string) => {
        const updated = {
            ...metadata,
            notes,
            lastUpdated: new Date().toISOString(),
        };
        setMetadata(updated);
        saveAdminMetadata(formId, submissionBlobId, updated);
    };

    const handlePriorityChange = (priority: "low" | "medium" | "high" | "critical") => {
        const updated = {
            ...metadata,
            priority,
            lastUpdated: new Date().toISOString(),
        };
        setMetadata(updated);
        saveAdminMetadata(formId, submissionBlobId, updated);
    };

    const addTag = (rawTag: string) => {
        const normalized = rawTag.trim().toLowerCase();
        if (!normalized) return;
        if (metadata.tags.includes(normalized)) return;
        const updated = {
            ...metadata,
            tags: [...metadata.tags, normalized],
            lastUpdated: new Date().toISOString(),
        };
        setMetadata(updated);
        saveAdminMetadata(formId, submissionBlobId, updated);
    };

    const removeTag = (tag: string) => {
        const updated = {
            ...metadata,
            tags: metadata.tags.filter((t) => t !== tag),
            lastUpdated: new Date().toISOString(),
        };
        setMetadata(updated);
        saveAdminMetadata(formId, submissionBlobId, updated);
    };

    const commitTagInput = () => {
        if (!tagInput.trim()) return;
        addTag(tagInput);
        setTagInput("");
    };

    const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitTagInput();
        }
        if (e.key === "Backspace" && !tagInput && metadata.tags.length > 0) {
            removeTag(metadata.tags[metadata.tags.length - 1]);
        }
    };

    const priorityColors = {
        low: "text-[#06b6d4]",
        medium: "text-[#a78bfa]",
        high: "text-[#fbbf24]",
        critical: "text-[#ef4444]",
    };

    return (
        <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-4">
            <div className="grid grid-cols-[1fr_auto] gap-4 mb-3">
                <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                        Notes
                    </label>
                    <textarea
                        value={metadata.notes}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        placeholder="Add admin notes (not shared with submitter)"
                        className="w-full resize-none rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-3 py-2 text-xs text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:border-[#a78bfa] focus:outline-none"
                        rows={2}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                        Priority
                    </label>
                    <select
                        value={metadata.priority}
                        onChange={(e) =>
                            handlePriorityChange(
                                e.target.value as "low" | "medium" | "high" | "critical",
                            )
                        }
                        className={clsx(
                            "rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-2 py-1.5 text-xs font-semibold transition-colors focus:border-[#a78bfa] focus:outline-none",
                            priorityColors[metadata.priority],
                        )}
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                    Tags
                </label>
                <div className="flex min-h-[2.25rem] w-full flex-wrap items-center gap-1.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-2 py-2 transition-colors focus-within:border-[#a78bfa]">
                    {metadata.tags.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-md border border-[#a78bfa]/30 bg-[#a78bfa]/10 px-2 py-0.5 text-[10px] text-[#c4b5fd]"
                        >
                            {tag}
                            <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="text-[#a78bfa] transition-colors hover:text-[color:var(--text-primary)]"
                                aria-label={`Remove ${tag} tag`}
                            >
                                <Icon icon="fluent:dismiss-12-regular" className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                    <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={onTagKeyDown}
                        onBlur={commitTagInput}
                        placeholder={metadata.tags.length === 0 ? "Add tags (press Enter)" : ""}
                        className="min-w-[9rem] flex-1 bg-transparent text-xs text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] focus:outline-none"
                    />
                </div>
            </div>
        </div>
    );
}

// ── Export button ──────────────────────────────────────────────────────

interface ExportButtonProps {
    formId: string;
    formConfig: FormConfig;
    entries: SubmissionIndexEntry[];
    hasPrivateKey: boolean;
    format: "json" | "csv";
}

function ExportButton({
    formId,
    formConfig,
    entries,
    hasPrivateKey,
    format,
}: ExportButtonProps) {
    const [loading, setLoading] = useState(false);
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();

    const handleExport = async () => {
        if (!formConfig) return;
        setLoading(true);
        try {
            const exportable: ExportableResponse[] = [];

            for (const entry of entries) {
                try {
                    const raw = await fetchJSON<unknown>(entry.submissionBlobId);
                    let submission: Submission | null = null;
                    let isDecrypted = false;

                    if (entry.isEncrypted) {
                        // Skip encrypted rows we have no material for:
                        // v1 needs a local private key, v2 (Seal) needs a
                        // connected admin/owner wallet for the SessionKey
                        // signature.
                        const canSeal = isSealEnvelope(raw) && !!(account?.address && dAppKit);
                        const canEcies = isEncryptedEnvelope(raw) && hasPrivateKey;
                        if (!canSeal && !canEcies) continue;
                        try {
                            submission = await decryptToSubmission(
                                raw,
                                formId,
                                dAppKit,
                                account?.address ?? null,
                            );
                            isDecrypted = true;
                        } catch {
                            // Failed to decrypt this row; skip it.
                            continue;
                        }
                    } else {
                        submission = raw as Submission;
                        isDecrypted = true;
                    }

                    if (!submission) continue;

                    // Build exportable response by mapping field IDs to labels
                    const fieldByIdMap = new Map(
                        formConfig?.fields.map((f) => [f.id, f]) ?? [],
                    );
                    const responses = submission.responses.reduce(
                        (acc, resp) => {
                            const field = fieldByIdMap.get(resp.fieldId);
                            const fieldLabel = field?.label ?? `[unknown: ${resp.fieldId}]`;
                            // Handle WalrusBlobRef by converting to filename + URL
                            if (resp.value && typeof resp.value === "object" && "blobId" in resp.value) {
                                const ref = resp.value as { blobId: string; filename?: string };
                                acc[fieldLabel] = ref.filename
                                    ? `${ref.filename} (${ref.blobId})`
                                    : ref.blobId;
                            } else if (
                                field?.type === "rich_text" &&
                                typeof resp.value === "string"
                            ) {
                                // Strip HTML so CSV/JSON consumers see clean text.
                                acc[fieldLabel] = richTextToPlainText(resp.value);
                            } else {
                                acc[fieldLabel] = resp.value ?? "";
                            }
                            return acc;
                        },
                        {} as Record<string, string | string[] | number | boolean>,
                    );

                    exportable.push({
                        submissionId: submission.id,
                        submissionBlobId: entry.submissionBlobId,
                        submittedAt: entry.submittedAt,
                        submitterAddress: entry.submitterAddress ?? undefined,
                        isEncrypted: entry.isEncrypted,
                        isDecrypted,
                        responses,
                    });
                } catch {
                    // Skip this submission if it fails to load
                    continue;
                }
            }

            let content: string;
            let filename: string;

            if (format === "json") {
                content = exportResponsesAsJSON(formConfig, exportable);
                filename = `${formConfig.title}-responses-${new Date().toISOString().split("T")[0]}.json`;
            } else {
                content = exportResponsesAsCSV(formConfig, exportable);
                filename = `${formConfig.title}-responses-${new Date().toISOString().split("T")[0]}.csv`;
            }

            downloadFile(filename, content, format === "json" ? "application/json" : "text/csv");
        } catch (err) {
            console.error("Export failed:", err);
        } finally {
            setLoading(false);
        }
    };

    const icon = format === "json" ? "fluent:code-24-regular" : "fluent:table-24-regular";
    const label = format === "json" ? "Export as JSON" : "Export as CSV";

    return (
        <button
            onClick={handleExport}
            disabled={loading}
            className={clsx(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                loading
                    ? "bg-[#3f3f46] text-[#a1a1aa] cursor-not-allowed"
                    : "bg-[#a78bfa] text-[#0a0a0a] hover:bg-[#c4b5fd]",
            )}
        >
            <Icon icon={icon} className="w-3.5 h-3.5" />
            {loading ? "Exporting..." : label}
        </button>
    );
}

// ── Public export ──────────────────────────────────────────────────────

export default function ResponsesPage() {
    return (
        <div className="relative min-h-screen bg-[color:var(--background-app)] overflow-hidden">
            <DotGrid />
            <MouseGlow intensity="subtle" />
            <Suspense fallback={<ListSkeleton />}>
                <ResponsesContent />
            </Suspense>
        </div>
    );
}
