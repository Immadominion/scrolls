"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import Link from "next/link";
import clsx from "clsx";
import MouseGlow from "@/components/ui/MouseGlow";
import DotGrid from "@/components/ui/DotGrid";
import ThemeToggle from "@/components/theme/ThemeToggle";
import WalletButton from "@/components/wallet/WalletButton";
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
            <header className="relative h-14 flex items-center px-6 gap-4 bg-[color:var(--background-app)] z-20">
                <Link
                    href="/"
                    className="group flex items-center gap-2 text-[color:var(--text-primary)]"
                    aria-label="Scrolls home"
                >
                    <span className="relative w-7 h-7 rounded-2xl bg-gradient-to-br from-[#a78bfa]/15 to-[#06b6d4]/10 border border-[#a78bfa]/20 flex items-center justify-center transition-colors duration-200 group-hover:border-[#a78bfa]/40">
                        <Icon
                            icon="fluent:scroll-24-regular"
                            className="w-4 h-4 text-[#a78bfa] transition-transform duration-300 group-hover:rotate-[8deg]"
                        />
                    </span>
                    <span className="font-display font-semibold text-sm tracking-tight">
                        Scrolls
                    </span>
                </Link>
                <span className="text-[color:var(--text-muted)] text-base select-none">/</span>
                <span className="text-sm text-[color:var(--text-secondary)] font-medium">Dashboard</span>

                <div className="flex-1" />

                <ThemeToggle />
                <WalletButton className="text-xs" />

                <Link
                    href="/builder"
                    className="hidden min-h-10 items-center gap-1.5 rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] px-4 py-2 text-xs font-medium text-[color:var(--text-secondary)] transition-colors duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-panel)] hover:text-[color:var(--text-primary)] sm:flex"
                >
                    <Icon icon="fluent:add-12-regular" className="w-3.5 h-3.5" />
                    New form
                </Link>

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
                    <motion.div variants={itemVariants} className="mb-10">
                        <h1 className="text-4xl font-display font-bold text-[color:var(--text-primary)] tracking-tight mb-2">
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
                    </motion.div>

                    <DashboardContextCard
                        connected={isConnected}
                        address={accountAddress}
                        network={network}
                    />

                    {/* Stat cards */}
                    <motion.div
                        variants={itemVariants}
                        className="grid grid-cols-3 gap-3 mb-10 mt-10"
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
                                                    ? "These published forms are stored under the connected address index on this device. Phase 1 does not discover them from chain yet."
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
            className="rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] p-5 backdrop-blur-xl"
        >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                    <div className="flex items-center gap-2">
                        <span
                            className={connected
                                ? "h-2.5 w-2.5 rounded-full bg-[#06b6d4] shadow-[0_0_0_6px_rgba(6,182,212,0.12)]"
                                : "h-2.5 w-2.5 rounded-full bg-[#a78bfa] shadow-[0_0_0_6px_rgba(167,139,250,0.12)]"}
                        />
                        <p className="text-sm font-semibold text-[color:var(--text-primary)]">
                            {connected ? "Wallet session active" : "Wallet session inactive"}
                        </p>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">
                        {connected
                            ? `Scrolls is still local-first in Phase 1. The dashboard is showing the form index saved for ${truncateAddress(address ?? "")} on this browser, while drafts remain device-local until publish.`
                            : "Disconnecting your wallet only removes wallet access. It does not clear drafts or anonymous form indexes already saved in this browser, which is why you can still see local work here."}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                    {connected && network && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-[#06b6d4]/12 bg-[#06b6d4]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7dd3fc]">
                            <Icon icon="fluent:globe-20-regular" className="h-3.5 w-3.5" />
                            {network}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
                        <Icon icon="fluent:desktop-20-regular" className="h-3.5 w-3.5" />
                        Browser local storage
                    </span>
                </div>
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
                className="group block p-5 rounded-xl border border-[color:var(--border-default)] border-dashed bg-[color:var(--surface-panel)] backdrop-blur-sm hover:border-[color:var(--brand-primary-soft)] transition-colors duration-200"
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
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-medium text-[color:var(--text-secondary)] px-2.5 py-1.5">
                            Continue editing →
                        </span>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-[color:var(--text-muted)] hover:text-[color:var(--status-danger)] hover:bg-[color:var(--background-subtle)] transition-colors opacity-0 group-hover:opacity-100"
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
                className="group block cursor-pointer rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] p-5 backdrop-blur-sm transition-colors duration-200 hover:border-[color:var(--brand-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background-app)]"
            >
                <div className="flex items-start gap-4">
                    <DashboardIconFrame
                        icon={form.isPrivate ? "fluent:lock-closed-24-regular" : "fluent:document-24-regular"}
                    />

                    <div className="flex-1 min-w-0">
                        <p className="text-[color:var(--text-primary)] font-display font-semibold tracking-tight truncate">
                            {form.title}
                        </p>
                        <p className="text-xs text-[color:var(--text-muted)] mt-1 flex items-center gap-2 flex-wrap">
                            <span>{form.fieldCount} {form.fieldCount === 1 ? "field" : "fields"}</span>
                            <span className="text-[color:var(--text-muted)]">·</span>
                            <span>{form.responseCount} {form.responseCount === 1 ? "response" : "responses"}</span>
                            <span className="text-[color:var(--text-muted)]">·</span>
                            <span>{createdLabel}</span>
                            {form.isPrivate && (
                                <>
                                    <span className="text-[color:var(--text-muted)]">·</span>
                                    <span className="text-[color:var(--brand-secondary)]">Private</span>
                                </>
                            )}
                        </p>
                        <p className="text-[10px] text-[color:var(--text-soft)] mt-2 font-mono truncate">
                            {form.formId}
                        </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
        <div className="relative p-5 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] backdrop-blur-sm hover:border-[color:var(--border-strong)] transition-colors duration-200">
            <div className="flex items-start justify-between mb-3">
                <DashboardIconFrame
                    icon={icon}
                    className="h-8 w-8 rounded-[12px]"
                    iconClassName="h-4 w-4"
                />
            </div>
            <p className="text-2xl font-display font-bold text-[color:var(--text-primary)] tabular-nums tracking-tight">
                {value}
            </p>
            <p className="text-xs text-[color:var(--text-muted)] mt-1 uppercase tracking-wider font-medium">
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
