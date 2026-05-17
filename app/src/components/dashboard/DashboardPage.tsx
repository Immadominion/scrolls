"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import Link from "next/link";
import clsx from "clsx";
import ShareCardModal from "@/components/share/ShareCardModal";
import MouseGlow from "@/components/ui/MouseGlow";
import DotGrid from "@/components/ui/DotGrid";
import ScrollsLogo from "@/components/brand/ScrollsLogo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import WalletButton from "@/components/wallet/WalletButton";
import InboxView from "@/components/dashboard/InboxView";
import { useScrollsAccount } from "@/lib/useScrollsAccount";
import { useScrollsNetwork } from "@/lib/useScrollsAccount";
import {
    listForms,
    addForm,
    adoptAnonymousForms,
    type FormIndexEntry,
} from "@/lib/formIndex";
import { listSubmissions } from "@/lib/submissionIndex";
import { getMyForms, getSubmissionsForForm } from "@/lib/registry";
import { hasOnchainRegistry } from "@/lib/contracts";
import { truncateAddress } from "@/lib/sui";
import { listDrafts, removeDraft, type DraftEntry } from "@/lib/draftIndex";

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.07, delayChildren: 0.05 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as const },
    },
};

interface FormWithStats extends FormIndexEntry {
    responseCount: number;
}

export default function DashboardPage() {
    const account = useScrollsAccount();
    const network = useScrollsNetwork();
    const [mounted, setMounted] = useState(false);
    const [tab, setTab] = useState<"forms" | "inbox">("forms");
    const [forms, setForms] = useState<FormWithStats[]>([]);
    const [drafts, setDrafts] = useState<DraftEntry[]>([]);
    // Bumped after every storage write so we re-derive stats.
    const [refreshTick, setRefreshTick] = useState(0);

    // Adopt forms created before the wallet was connected the first time.
    useEffect(() => {
        if (account?.address) {
            adoptAnonymousForms(account.address);
            setRefreshTick((t) => t + 1);
        }
    }, [account?.address]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const entries = listForms(account?.address ?? null);
        const withStats: FormWithStats[] = entries.map((e) => ({
            ...e,
            responseCount: listSubmissions(e.formId).length,
        }));
        setForms(withStats);
        setDrafts(listDrafts());
    }, [mounted, account?.address, refreshTick]);

    // Cross-device discovery: fetch on-chain `FormPublished` events the
    // owner emitted from any browser, merge them into the local list,
    // and persist newly-found forms back into localStorage so the next
    // render is instant.
    useEffect(() => {
        if (!mounted || !account?.address || !hasOnchainRegistry()) return;
        let cancelled = false;
        (async () => {
            try {
                const onchain = await getMyForms(account.address);
                if (cancelled || onchain.length === 0) return;
                const known = new Set(
                    listForms(account.address).map((f) => f.formId),
                );
                let added = 0;
                for (const f of onchain) {
                    if (known.has(f.pointerId)) continue;
                    addForm(account.address, {
                        formId: f.pointerId,
                        title: "On-chain form",
                        createdAt: new Date(f.createdAtMs).toISOString(),
                        fieldCount: 0,
                        isPrivate: false,
                    });
                    added += 1;
                }
                if (added > 0) setRefreshTick((t) => t + 1);

                // Refresh response counts from on-chain events for any
                // pointer-id forms (cross-device responses).
                const counts = await Promise.all(
                    listForms(account.address)
                        .filter((f) => /^0x[0-9a-fA-F]{1,64}$/.test(f.formId))
                        .map(async (f) => {
                            const subs = await getSubmissionsForForm(f.formId);
                            return { formId: f.formId, count: subs.length };
                        }),
                );
                if (cancelled) return;
                if (counts.length > 0) {
                    setForms((prev) => {
                        const byId = new Map(counts.map((c) => [c.formId, c.count]));
                        return prev.map((p) => {
                            const remote = byId.get(p.formId);
                            if (remote === undefined) return p;
                            // Take the max so locally-cached entries never
                            // visually regress while the chain catches up.
                            return { ...p, responseCount: Math.max(p.responseCount, remote) };
                        });
                    });
                }
            } catch {
                // Silent fallback to local-only mode.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mounted, account?.address, refreshTick]);

    const accountAddress = account?.address ?? null;
    const isConnected = Boolean(accountAddress);

    const stats = useMemo(() => {
        const totalResponses = forms.reduce((acc, f) => acc + f.responseCount, 0);
        return {
            drafts: drafts.length,
            forms: forms.length,
            responses: totalResponses,
        };
    }, [forms, drafts]);

    return (
        <div className="relative min-h-screen bg-[color:var(--background-app)] text-[color:var(--text-primary)] flex flex-col overflow-hidden">
            {/* Header */}
            <header className="relative h-14 flex items-center px-4 sm:px-6 gap-2 sm:gap-4 bg-[color:var(--background-app)] z-20">
                <Link
                    href="/"
                    className="group flex items-center gap-2 text-[color:var(--text-primary)] shrink-0"
                    aria-label="Scrolls home"
                >
                    <ScrollsLogo
                        decorative
                        className="h-7 w-7 transition-transform duration-300 group-hover:rotate-[8deg]"
                    />
                    <span className="font-display font-semibold text-sm tracking-tight hidden sm:block">
                        Scrolls
                    </span>
                </Link>
                <span className="text-[color:var(--text-muted)] text-base select-none shrink-0 hidden sm:block">/</span>
                <span className="text-sm text-[color:var(--text-secondary)] font-medium truncate hidden sm:block">Dashboard</span>

                <div className="flex-1" />

                <ThemeToggle />
                <WalletButton className="text-xs" />

                {/* Gradient bottom border */}
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
                    aria-hidden="true"
                    style={{
                        background:
                            "linear-gradient(90deg, transparent 0%, rgba(167, 139, 250, 0.25) 30%, rgba(6, 182, 212, 0.2) 70%, transparent 100%)",
                    }}
                />
            </header>

            {/* Ambient backdrop */}
            <DotGrid />
            <MouseGlow intensity="subtle" />

            {/* Content */}
            <main className="relative flex-1 max-w-5xl mx-auto w-full px-6 py-14 z-10">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                >
                    <motion.div variants={itemVariants} className="mb-10 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="text-3xl sm:text-4xl font-display font-bold text-[color:var(--text-primary)] tracking-tight mb-2">
                                {isConnected ? "Wallet dashboard" : "Local workspace"}
                            </h1>
                            <p className="text-sm text-[color:var(--text-secondary)] flex items-center gap-2 flex-wrap">
                                {isConnected ? (
                                    <>
                                        <span>Wallet-linked index on this browser</span>
                                        <span className="text-[color:var(--text-muted)]">·</span>
                                        <span>Responses are permanent on Walrus</span>
                                        <span className="text-[color:var(--text-muted)]">·</span>
                                        <span className="text-[color:var(--brand-secondary)] font-mono">
                                            {truncateAddress(accountAddress ?? "")}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span>Disconnected from wallet</span>
                                        <span className="text-[color:var(--text-muted)]">·</span>
                                        <span>Showing browser-local drafts and anonymous indexes</span>
                                    </>
                                )}
                            </p>
                        </div>
                        <Link
                            href="/builder"
                            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] text-[color:var(--text-secondary)] transition-colors duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-panel)] hover:text-[color:var(--text-primary)] mt-1"
                            aria-label="New form"
                            title="New form"
                        >
                            <Icon icon="fluent:add-12-regular" className="w-4 h-4" />
                        </Link>
                    </motion.div>

                    <DashboardContextCard
                        connected={isConnected}
                        address={accountAddress}
                        network={network}
                    />

                    {/* Stat cards */}
                    <motion.div
                        variants={itemVariants}
                        className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 sm:mb-10 mt-6 sm:mt-10"
                    >
                        <StatCard
                            label="Drafts"
                            value={stats.drafts.toString()}
                            icon="fluent:document-edit-24-regular"
                        />
                        <StatCard
                            label={isConnected ? "Wallet forms" : "Browser forms"}
                            value={stats.forms.toString()}
                            icon={isConnected ? "fluent:wallet-credit-card-24-regular" : "fluent:window-browser-24-regular"}
                        />
                        <StatCard
                            label="Responses"
                            value={stats.responses.toString()}
                            icon="fluent:chat-multiple-24-regular"
                        />
                    </motion.div>

                    <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
                        <div className="inline-flex rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--background-subtle)] p-1">
                            <button
                                type="button"
                                onClick={() => setTab("forms")}
                                className={clsx(
                                    "inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-medium transition-colors",
                                    tab === "forms"
                                        ? "bg-[color:var(--surface-panel)] text-[color:var(--text-primary)]"
                                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                                )}
                            >
                                <Icon icon="fluent:document-table-24-regular" className="w-4 h-4" />
                                Forms
                                <span className="rounded-full bg-[color:var(--background-subtle)] px-2 py-0.5 text-[11px] text-[color:var(--text-tertiary)]">
                                    {forms.length + drafts.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab("inbox")}
                                className={clsx(
                                    "inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-medium transition-colors",
                                    tab === "inbox"
                                        ? "bg-[color:var(--surface-panel)] text-[color:var(--text-primary)]"
                                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                                )}
                            >
                                <Icon icon="fluent:chat-multiple-24-regular" className="w-4 h-4" />
                                Inbox
                                <span className="rounded-full bg-[color:var(--background-subtle)] px-2 py-0.5 text-[11px] text-[color:var(--text-tertiary)]">
                                    {stats.responses}
                                </span>
                            </button>
                        </div>
                    </motion.div>

                    {tab === "inbox" ? (
                        <InboxView
                            ownerAddress={accountAddress}
                            isConnected={isConnected}
                        />
                    ) : (
                        <>
                            {/* Forms list / empty state */}
                            {forms.length === 0 && drafts.length === 0 ? (
                                <EmptyState isConnected={isConnected} />
                            ) : (
                                <div>
                                    {drafts.length > 0 && (
                                        <>
                                            <motion.div variants={itemVariants} className="mb-4">
                                                <SectionHeading
                                                    eyebrow="Local"
                                                    title="Drafts on this browser"
                                                    description="Drafts are always saved locally until you publish them to Walrus. Disconnecting a wallet does not remove them."
                                                />
                                            </motion.div>
                                            <motion.ul variants={itemVariants} className="space-y-3">
                                                {drafts.map((draft) => (
                                                    <DraftCard
                                                        key={draft.draftId}
                                                        draft={draft}
                                                        onDelete={() => {
                                                            removeDraft(draft.draftId);
                                                            setDrafts((prev) => prev.filter((d) => d.draftId !== draft.draftId));
                                                            setRefreshTick((t) => t + 1);
                                                        }}
                                                    />
                                                ))}
                                            </motion.ul>
                                        </>
                                    )}

                                    {forms.length > 0 && (
                                        <>
                                            <motion.div
                                                variants={itemVariants}
                                                className={drafts.length > 0 ? "mb-4 mt-10" : "mb-4"}
                                            >
                                                <SectionHeading
                                                    eyebrow={isConnected ? "Wallet" : "Browser"}
                                                    title={isConnected ? "Forms indexed to this wallet" : "Anonymous forms on this browser"}
                                                    description={
                                                        isConnected
                                                            ? "These published forms are stored under the connected address index on this device."
                                                            : "These forms were created before a wallet was connected, so the index still lives in this browser only."
                                                    }
                                                />
                                            </motion.div>
                                            <motion.ul variants={itemVariants} className="space-y-3">
                                                {forms.map((form) => (
                                                    <FormCard key={form.formId} form={form} />
                                                ))}
                                            </motion.ul>
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </motion.div>
            </main>
        </div>
    );
}

function DashboardContextCard({
    connected,
    address,
    network,
}: {
    connected: boolean;
    address: string | null;
    network: string | null;
}) {
    return (
        <motion.div
            variants={itemVariants}
            className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
        >
            <p className="text-sm leading-relaxed text-[color:var(--text-secondary)] max-w-2xl">
                {connected
                    ? `The dashboard is showing the form index saved for ${truncateAddress(address ?? "")} on this browser. Drafts remain device-local until published to Walrus.`
                    : "Disconnecting your wallet only removes wallet access. Drafts and anonymous form indexes already saved in this browser remain visible here."}
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
                {connected && network && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#a78bfa]/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a78bfa]">
                        <Icon icon="fluent:globe-20-regular" className="h-3.5 w-3.5" />
                        {network}
                    </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#a78bfa]/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a78bfa]">
                    <Icon icon="fluent:desktop-20-regular" className="h-3.5 w-3.5" />
                    Browser local
                </span>
            </div>
        </motion.div>
    );
}

function SectionHeading({
    eyebrow,
    title,
    description,
}: {
    eyebrow: string;
    title: string;
    description: string;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--text-tertiary)]">
                {eyebrow}
            </span>
            <h2 className="text-lg font-display font-semibold tracking-tight text-[color:var(--text-primary)]">
                {title}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-tertiary)]">
                {description}
            </p>
        </div>
    );
}

function DraftCard({ draft, onDelete }: { draft: DraftEntry; onDelete: () => void }) {
    const updated = new Date(draft.updatedAt);
    const updatedLabel = updated.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: updated.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });

    return (
        <li>
            <Link
                href={`/builder?localDraft=${draft.draftId}`}
                className="group block p-4 sm:p-5 rounded-xl border border-[color:var(--border-default)] border-dashed bg-[color:var(--surface-panel)] backdrop-blur-sm hover:border-[color:var(--brand-primary-soft)] transition-colors duration-200"
            >
                <div className="flex items-start gap-4">
                    <DashboardIconFrame icon="fluent:document-edit-24-regular" />

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-[color:var(--text-primary)] font-display font-semibold tracking-tight truncate opacity-80">
                                {draft.title}
                            </p>
                            <span className="shrink-0 text-[10px] font-medium text-[color:var(--brand-primary)] border border-[color:var(--brand-primary-soft)] bg-[color:var(--brand-primary-soft)] rounded px-1.5 py-0.5">
                                Draft
                            </span>
                        </div>
                        <p className="text-xs text-[color:var(--text-muted)] mt-1 flex items-center gap-2 flex-wrap">
                            <span>{draft.fieldCount} {draft.fieldCount === 1 ? "field" : "fields"}</span>
                            <span className="text-[color:var(--text-muted)]">·</span>
                            <span>Last edited {updatedLabel}</span>
                            {draft.isPrivate && (
                                <>
                                    <span className="text-[color:var(--text-muted)]">·</span>
                                    <span className="text-[color:var(--brand-secondary)]">Private</span>
                                </>
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <span className="hidden sm:inline-flex opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-medium text-[color:var(--text-secondary)] px-2.5 py-1.5">
                            Continue editing →
                        </span>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-[color:var(--text-muted)] hover:text-[color:var(--status-danger)] hover:bg-[color:var(--background-subtle)] transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label="Delete draft"
                            title="Delete draft"
                        >
                            <Icon icon="fluent:delete-24-regular" className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </Link>
        </li>
    );
}

function FormCard({ form }: { form: FormWithStats }) {
    const [copied, setCopied] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const formHref = `/f?id=${form.formId}`;
    const formUrl =
        typeof window !== "undefined"
            ? `${window.location.origin}${formHref}`
            : formHref;

    const openForm = () => {
        if (typeof window === "undefined") return;
        window.open(formHref, "_blank", "noopener,noreferrer");
    };

    const copyLink = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(formUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const created = new Date(form.createdAt);
    const createdLabel = created.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: created.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });

    return (
        <li>
            <div
                role="link"
                tabIndex={0}
                onClick={openForm}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openForm();
                    }
                }}
                className="group block cursor-pointer rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] p-4 sm:p-5 backdrop-blur-sm transition-colors duration-200 hover:border-[color:var(--brand-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background-app)]"
            >
                <div className="flex items-start gap-4">
                    <DashboardIconFrame
                        icon={form.isPrivate ? "fluent:lock-closed-24-regular" : "fluent:document-24-regular"}
                    />

                    <div className="flex-1 min-w-0">
                        <p className="text-[color:var(--text-primary)] font-display font-semibold tracking-tight truncate">
                            {form.title}
                        </p>
                        <p className="text-xs text-[color:var(--text-muted)] mt-1 truncate">
                            <span>{form.fieldCount} {form.fieldCount === 1 ? "field" : "fields"}</span>
                            <span className="mx-1.5 text-[color:var(--text-muted)]">·</span>
                            <span>{form.responseCount} {form.responseCount === 1 ? "response" : "responses"}</span>
                            <span className="mx-1.5 text-[color:var(--text-muted)]">·</span>
                            <span>{createdLabel}</span>
                            {form.isPrivate && (
                                <>
                                    <span className="mx-1.5 text-[color:var(--text-muted)]">·</span>
                                    <span className="text-[color:var(--brand-secondary)]">Private</span>
                                </>
                            )}
                        </p>
                        <p className="text-[10px] text-[color:var(--text-soft)] mt-2 font-mono truncate">
                            {form.formId}
                        </p>
                    </div>

                    {/* Mobile: always-visible Responses tap target */}
                    <Link
                        href={`/responses?id=${form.formId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="sm:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors"
                        aria-label="View responses"
                        title="View responses"
                    >
                        <Icon icon="fluent:list-bar-tree-24-regular" className="w-4 h-4" />
                    </Link>

                    <div className="hidden sm:flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Link
                            href={`/responses?id=${form.formId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-xl text-[11px] font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] bg-white/0 hover:bg-[color:var(--background-subtle)] transition-colors"
                            aria-label="View responses"
                            title="View responses"
                        >
                            <Icon icon="fluent:list-bar-tree-24-regular" className="w-3.5 h-3.5" />
                            Responses
                        </Link>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShareOpen(true);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors"
                            aria-label="Open share card"
                            title="Share card &amp; QR"
                        >
                            <Icon icon="fluent:qr-code-24-regular" className="w-4 h-4" />
                        </button>
                        <button
                            onClick={copyLink}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors"
                            aria-label="Copy share link"
                            title="Copy share link"
                        >
                            <Icon
                                icon={copied ? "fluent:checkmark-24-regular" : "fluent:copy-24-regular"}
                                className={`w-4 h-4 ${copied ? "text-[color:var(--brand-primary)]" : ""}`}
                            />
                        </button>
                        <span
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-[color:var(--text-muted)] group-hover:text-[color:var(--text-primary)] transition-colors"
                            aria-hidden="true"
                        >
                            <Icon icon="fluent:open-24-regular" className="w-4 h-4" />
                        </span>
                    </div>
                </div>
            </div>
            <AnimatePresence>
                {shareOpen && (
                    <ShareCardModal
                        title={form.title}
                        canonicalUrl={formUrl}
                        isPrivate={form.isPrivate}
                        blobId={form.formId}
                        onClose={() => setShareOpen(false)}
                    />
                )}
            </AnimatePresence>
        </li>
    );
}

function EmptyState({ isConnected }: { isConnected: boolean }) {
    return (
        <motion.div
            variants={itemVariants}
            className="relative flex flex-col items-center justify-center py-24 text-center border border-dashed border-[color:var(--border-default)] rounded-2xl bg-[color:var(--surface-panel)] backdrop-blur-sm overflow-hidden"
        >
            {/* Animated orb */}
            <div className="relative w-20 h-20 mb-7">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-2xl"
                    style={{
                        background:
                            "conic-gradient(from 0deg, rgba(167, 139, 250, 0.4), rgba(6, 182, 212, 0.3), rgba(167, 139, 250, 0.4))",
                        filter: "blur(20px)",
                        opacity: 0.6,
                    }}
                />
                <div className="absolute inset-0 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] flex items-center justify-center">
                    <Icon
                        icon="fluent:form-multiple-48-regular"
                        className="w-9 h-9 text-[#a78bfa]"
                    />
                </div>
            </div>

            <p className="text-base font-display font-semibold text-[color:var(--text-primary)] mb-2 tracking-tight">
                {isConnected ? "No forms yet" : "No local work yet"}
            </p>
            <p className="text-sm text-[color:var(--text-muted)] max-w-sm mb-7 leading-relaxed">
                {isConnected
                    ? "Create your first form and every response will be stored permanently on Walrus — censorship-resistant, indelible, yours."
                    : "Create a form or connect a wallet. Drafts and anonymous indexes appear here as soon as this browser has local work to resume."}
            </p>
            <Link href="/builder">
                <motion.span
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[color:var(--brand-primary)] text-[color:var(--text-inverse)] font-semibold rounded-xl text-sm hover:bg-[color:var(--brand-primary-hover)] transition-colors duration-150 shadow-[0_0_0_1px_rgba(167,139,250,0.4),0_8px_24px_-8px_rgba(167,139,250,0.6)]"
                >
                    <Icon icon="fluent:add-24-filled" className="w-4 h-4" />
                    Create your first form
                </motion.span>
            </Link>
        </motion.div>
    );
}

function StatCard({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: string;
}) {
    return (
        <div className="relative p-3 sm:p-5 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] backdrop-blur-sm hover:border-[color:var(--border-strong)] transition-colors duration-200">
            <DashboardIconFrame
                icon={icon}
                className="h-7 w-7 sm:h-8 sm:w-8 rounded-[10px] sm:rounded-[12px] mb-2 sm:mb-3"
                iconClassName="h-3.5 w-3.5 sm:h-4 sm:w-4"
            />
            <p className="text-xl sm:text-2xl font-display font-bold text-[color:var(--text-primary)] tabular-nums tracking-tight">
                {value}
            </p>
            <p className="text-[10px] sm:text-xs text-[color:var(--text-muted)] mt-0.5 sm:mt-1 uppercase tracking-wider font-medium leading-tight">
                {label}
            </p>
        </div>
    );
}

function DashboardIconFrame({
    icon,
    tone = "neutral",
    className,
    iconClassName,
}: {
    icon: string;
    tone?: "neutral" | "brand" | "info";
    className?: string;
    iconClassName?: string;
}) {
    const tones = {
        neutral: {
            frame: "border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)]",
            icon: "text-[color:var(--text-secondary)]",
        },
        brand: {
            frame: "border-[color:var(--brand-primary-soft)] bg-[color:var(--brand-primary-soft)]",
            icon: "text-[color:var(--brand-primary)]",
        },
        info: {
            frame: "border-[color:var(--brand-secondary-soft)] bg-[color:var(--brand-secondary-soft)]",
            icon: "text-[color:var(--brand-secondary)]",
        },
    } as const;

    return (
        <span
            className={clsx(
                "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-[14px] border",
                tones[tone].frame,
                className,
            )}
        >
            <Icon icon={icon} className={clsx("h-5 w-5", tones[tone].icon, iconClassName)} />
        </span>
    );
}
