"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { X, Loader2, Copy, Check, ExternalLink, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import clsx from "clsx";
import type { FormConfig } from "@/types";
import { useScrollsAccount, useScrollsDAppKit } from "@/lib/useScrollsAccount";
import {
    createShortLinkSmart,
    isValidCustomSlug,
    shortLinkUrl,
    type ShortLinkResult,
} from "@/lib/shortLink";

// ── Animation variants (match PublishModal so the two feel of a piece) ──

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

const modalVariants = {
    hidden: { opacity: 0, scale: 0.96, y: 8 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 8 },
};

interface ShareModalProps {
    formConfig: FormConfig;
    /** Canonical full URL — what the short link will redirect to. */
    canonicalUrl: string;
    onClose: () => void;
}

const EXPIRY_OPTIONS: { label: string; days: number | undefined }[] = [
    { label: "Never", days: undefined },
    { label: "1 day", days: 1 },
    { label: "7 days", days: 7 },
    { label: "30 days", days: 30 },
    { label: "1 year", days: 365 },
];

export default function ShareModal({ formConfig, canonicalUrl, onClose }: ShareModalProps) {
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();

    const defaultSlug = useMemo(() => slugify(formConfig.title), [formConfig.title]);
    const [slug, setSlug] = useState(defaultSlug);
    const [expiryDays, setExpiryDays] = useState<number | undefined>(undefined);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ShortLinkResult & { fallbackUsed: boolean } | null>(null);
    const [copiedShort, setCopiedShort] = useState(false);
    const [copiedLong, setCopiedLong] = useState(false);

    const slugError = useMemo(() => {
        if (!slug.trim()) return null;
        return isValidCustomSlug(slug.trim().toLowerCase())
            ? null
            : "3–40 chars, a–z, 0–9, hyphen; cannot start or end with hyphen.";
    }, [slug]);

    // Lock background scroll while open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    const handleCreate = async () => {
        if (!account || !dAppKit) {
            setError("Connect your wallet to create a short link.");
            return;
        }
        if (slugError) return;
        setError(null);
        setCreating(true);
        try {
            const out = await createShortLinkSmart(dAppKit, account.address, {
                target: canonicalUrl,
                slug: slug.trim() || undefined,
                expiresInDays: expiryDays,
            });
            setResult(out);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create short link.");
        } finally {
            setCreating(false);
        }
    };

    const copy = async (value: string, which: "short" | "long") => {
        try {
            await navigator.clipboard.writeText(value);
            if (which === "short") {
                setCopiedShort(true);
                setTimeout(() => setCopiedShort(false), 2000);
            } else {
                setCopiedLong(true);
                setTimeout(() => setCopiedLong(false), 2000);
            }
        } catch {
            /* noop */
        }
    };

    const shareUrl = result?.url ?? canonicalUrl;
    const shareTitle = formConfig.title || "Scrolls form";
    const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareTitle} — `)}&url=${encodeURIComponent(shareUrl)}`;

    return (
        <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <motion.div
                variants={modalVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.25, 0.4, 0.25, 1] }}
                className="relative w-full max-w-md rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute right-3 top-3 z-10 p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors"
                    aria-label="Close"
                >
                    <X size={16} />
                </button>

                <div className="p-6 space-y-6">
                    <header>
                        <h2 className="text-xl font-display font-bold text-[color:var(--text-primary)]">
                            Share form
                        </h2>
                        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                            {result
                                ? "Your short link is ready."
                                : "Pick a short, memorable URL — or leave it blank for an auto-generated one."}
                        </p>
                    </header>

                    <AnimatePresence mode="wait" initial={false}>
                        {!result ? (
                            <motion.div
                                key="form"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.18, ease: [0.25, 0.4, 0.25, 1] }}
                                className="space-y-5"
                            >
                                {/* Custom slug */}
                                <div>
                                    <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1.5">
                                        Custom slug
                                    </label>
                                    <div
                                        className={clsx(
                                            "flex items-center rounded-xl border bg-[color:var(--surface-solid)] overflow-hidden focus-within:border-[color:var(--brand-primary-soft)] transition-colors",
                                            slugError
                                                ? "border-[color:var(--status-danger)]/40"
                                                : "border-[color:var(--border-subtle)]",
                                        )}
                                    >
                                        <span className="pl-3 pr-1 text-xs font-mono text-[color:var(--text-muted)] select-none">
                                            scrolls.fun/s/
                                        </span>
                                        <input
                                            value={slug}
                                            onChange={(e) =>
                                                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
                                            }
                                            placeholder="auto"
                                            maxLength={40}
                                            disabled={creating}
                                            spellCheck={false}
                                            className="flex-1 bg-transparent py-2 pr-3 text-sm font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]/60 focus:outline-none"
                                        />
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-[color:var(--text-muted)] leading-relaxed">
                                        {slugError ? (
                                            <span className="text-[color:var(--status-danger)]">{slugError}</span>
                                        ) : (
                                            "Leave blank for an auto-generated 5-character code. If your slug is taken by someone else, we’ll fall back to one."
                                        )}
                                    </p>
                                </div>

                                {/* Expiry */}
                                <div>
                                    <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1.5">
                                        Expires
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {EXPIRY_OPTIONS.map((opt) => {
                                            const selected = expiryDays === opt.days;
                                            return (
                                                <button
                                                    key={opt.label}
                                                    type="button"
                                                    onClick={() => setExpiryDays(opt.days)}
                                                    disabled={creating}
                                                    className={clsx(
                                                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                                                        selected
                                                            ? "border-[#a78bfa]/40 bg-[#a78bfa]/10 text-[#a78bfa]"
                                                            : "border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]",
                                                    )}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg border border-[color:var(--status-danger)]/30 bg-[color:var(--status-danger-soft)] text-xs text-[color:var(--status-danger)] flex items-start gap-2">
                                        <Icon icon="fluent:warning-24-regular" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span className="leading-relaxed">{error}</span>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleCreate}
                                    disabled={creating || !!slugError || !account}
                                    className={clsx(
                                        "w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                                        creating || !account
                                            ? "bg-[color:var(--surface-muted)] text-[color:var(--text-muted)] cursor-not-allowed"
                                            : "bg-[color:var(--text-primary)] text-[color:var(--text-inverse)] hover:opacity-90",
                                    )}
                                >
                                    {creating ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Signing &amp; saving…
                                        </>
                                    ) : !account ? (
                                        "Connect a wallet to share"
                                    ) : (
                                        <>
                                            <QrCode size={14} />
                                            Create short link
                                        </>
                                    )}
                                </button>

                                {/* Original URL — always available, copy-only */}
                                <div className="pt-2 border-t border-[color:var(--border-subtle)]">
                                    <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">
                                        Or share the full URL
                                    </p>
                                    <div className="p-2.5 rounded-lg bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)] flex items-center gap-2">
                                        <span className="flex-1 text-[11px] font-mono text-[color:var(--text-secondary)] truncate">
                                            {canonicalUrl}
                                        </span>
                                        <button
                                            onClick={() => copy(canonicalUrl, "long")}
                                            className="text-[color:var(--text-muted)] hover:text-[#a78bfa] transition-colors shrink-0"
                                            aria-label="Copy URL"
                                        >
                                            {copiedLong ? (
                                                <Check size={14} className="text-[#a78bfa]" />
                                            ) : (
                                                <Copy size={14} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.18, ease: [0.25, 0.4, 0.25, 1] }}
                                className="space-y-5"
                            >
                                {/* QR + URL */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)]">
                                    <div className="rounded-lg bg-white p-2 shrink-0">
                                        <QRCodeSVG
                                            value={result.url}
                                            size={88}
                                            level="M"
                                            marginSize={0}
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-1">
                                            Short link
                                        </p>
                                        <p className="font-mono text-sm text-[color:var(--text-primary)] break-all leading-snug">
                                            {result.url}
                                        </p>
                                        {result.expiresAt && (
                                            <p className="mt-1.5 text-[11px] text-[color:var(--text-muted)]">
                                                Expires {formatExpiry(result.expiresAt)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {result.fallbackUsed && (
                                    <div className="p-2.5 rounded-lg border border-[#a78bfa]/25 bg-[#a78bfa]/5 text-[11px] text-[color:var(--text-secondary)] flex items-start gap-2">
                                        <Icon icon="fluent:info-24-regular" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#a78bfa]" />
                                        <span className="leading-relaxed">
                                            That custom slug was already taken — we generated{" "}
                                            <span className="font-mono">{result.code}</span> for you instead.
                                        </span>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div className="grid grid-cols-3 gap-1.5">
                                    <button
                                        onClick={() => copy(result.url, "short")}
                                        className={clsx(
                                            "inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors border",
                                            copiedShort
                                                ? "border-[#a78bfa]/30 bg-[#a78bfa]/10 text-[#a78bfa]"
                                                : "border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]",
                                        )}
                                    >
                                        {copiedShort ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedShort ? "Copied" : "Copy"}
                                    </button>
                                    <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] transition-colors"
                                    >
                                        <ExternalLink size={12} />
                                        Open
                                    </a>
                                    <a
                                        href={tweet}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] transition-colors"
                                    >
                                        <Icon icon="fluent:share-24-regular" className="w-3 h-3" />
                                        Tweet
                                    </a>
                                </div>

                                <button
                                    onClick={() => {
                                        setResult(null);
                                        setError(null);
                                    }}
                                    className="w-full py-2 rounded-xl border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] transition-colors"
                                >
                                    Create another link
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── helpers ────────────────────────────────────────────────────────────

function slugify(input: string): string {
    return input
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "")
        .slice(0, 32);
}

function formatExpiry(ms: number): string {
    const date = new Date(ms);
    const now = Date.now();
    const diffDays = Math.round((ms - now) / (24 * 60 * 60 * 1000));
    if (diffDays <= 0) return "soon";
    if (diffDays === 1) return "tomorrow";
    if (diffDays < 14) return `in ${diffDays} days`;
    return `on ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}
