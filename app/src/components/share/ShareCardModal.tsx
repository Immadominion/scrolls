"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import { QRCodeCanvas } from "qrcode.react";
import { X, Copy, Check, ExternalLink, Download, Loader2, Link as LinkIcon, ChevronDown } from "lucide-react";
import ShareCard from "./ShareCard";
import { downloadShareCardPng } from "@/lib/cardImage";
import { useScrollsAccount, useScrollsDAppKit } from "@/lib/useScrollsAccount";
import {
    createShortLinkSmart,
    isValidCustomSlug,
    type ShortLinkResult,
} from "@/lib/shortLink";

interface ShareCardModalProps {
    /** Form metadata used inside the card. */
    title: string;
    /** Canonical long URL — what the short link will redirect to. Always
     *  available even before a short link exists. */
    canonicalUrl: string;
    isPrivate?: boolean;
    blobId?: string;
    /** Optional starting code if the maker already created a short link
     *  elsewhere (e.g. earlier session). When set, the modal opens
     *  straight into the share-card view. */
    initialShortLink?: ShortLinkResult | null;
    onClose: () => void;
}

const easing = [0.25, 0.4, 0.25, 1] as const;

const EXPIRY_OPTIONS: { label: string; days: number | undefined }[] = [
    { label: "Never", days: undefined },
    { label: "1d", days: 1 },
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "1y", days: 365 },
];

export default function ShareCardModal({
    title,
    canonicalUrl,
    isPrivate,
    blobId,
    initialShortLink = null,
    onClose,
}: ShareCardModalProps) {
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();

    const defaultSlug = useMemo(() => slugify(title), [title]);
    const [slug, setSlug] = useState(defaultSlug);
    const [expiryDays, setExpiryDays] = useState<number | undefined>(undefined);
    const [shortLink, setShortLink] = useState<ShortLinkResult | null>(initialShortLink);
    const [fallbackUsed, setFallbackUsed] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [showCustomize, setShowCustomize] = useState(false);

    const slugError = useMemo(() => {
        const v = slug.trim();
        if (!v) return null;
        return isValidCustomSlug(v.toLowerCase()) ? null : "3–40 chars · a–z, 0–9, hyphen";
    }, [slug]);

    // The URL the card actually advertises — short if available.
    const activeUrl = shortLink?.url ?? canonicalUrl;
    const activeCode = shortLink?.code ?? null;

    // Lock body scroll
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    // Hidden offscreen QR canvas used only for PNG export (high-res).
    const exportQrRef = useRef<HTMLCanvasElement | null>(null);

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
            setShortLink(out);
            setFallbackUsed(out.fallbackUsed);
            setShowCustomize(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create short link.");
        } finally {
            setCreating(false);
        }
    };

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(activeUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            /* noop */
        }
    };

    const downloadPng = async () => {
        const qr = exportQrRef.current;
        if (!qr) return;
        setDownloading(true);
        try {
            const filenameBase = slugify(title) || "scrolls-form";
            await downloadShareCardPng(
                {
                    title,
                    url: activeUrl,
                    isPrivate,
                    blobId,
                    shortCode: activeCode,
                    qrCanvas: qr,
                },
                `${filenameBase}-share-card.png`,
            );
        } catch (err) {
            if (process.env.NODE_ENV === "development") {
                console.error("[ShareCardModal] PNG export failed", err);
            }
            setError("Could not generate image. Try again.");
        } finally {
            setDownloading(false);
        }
    };

    const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${title} — `)}&url=${encodeURIComponent(activeUrl)}`;

    return (
        <motion.div
            key="share-card-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: easing }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4 overflow-y-auto"
            onClick={onClose}
        >
            <motion.div
                key="share-card-modal"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.25, ease: easing }}
                className="relative w-full max-w-md my-8 rounded-3xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute right-3 top-3 z-20 p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors"
                    aria-label="Close"
                >
                    <X size={16} />
                </button>

                <div className="p-5 sm:p-6 space-y-5">
                    <header>
                        <h2 className="text-lg font-display font-bold text-[color:var(--text-primary)]">
                            Share your form
                        </h2>
                        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                            {shortLink
                                ? "Card ready. Save the image or copy the link."
                                : "A scannable card people can save, scan, or share."}
                        </p>
                    </header>

                    {/* The card itself */}
                    <ShareCard
                        title={title}
                        url={activeUrl}
                        isPrivate={isPrivate}
                        blobId={blobId}
                        shortCode={activeCode}
                        compact
                    />

                    {/* Primary actions */}
                    <div className="grid grid-cols-4 gap-1.5">
                        <ActionButton
                            onClick={copyUrl}
                            label={copied ? "Copied" : "Copy"}
                            icon={copied ? <Check size={14} /> : <Copy size={14} />}
                            highlight={copied}
                        />
                        <ActionButton
                            href={activeUrl}
                            label="Open"
                            icon={<ExternalLink size={14} />}
                        />
                        <ActionButton
                            href={tweet}
                            label="Tweet"
                            icon={<Icon icon="fluent:share-24-regular" className="w-3.5 h-3.5" />}
                        />
                        <ActionButton
                            onClick={downloadPng}
                            label={downloading ? "Saving" : "Image"}
                            icon={downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            disabled={downloading}
                        />
                    </div>

                    {/* Short-link section */}
                    {shortLink ? (
                        <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] p-3 flex items-center gap-3">
                            <div className="shrink-0 w-7 h-7 rounded-lg bg-[#a78bfa]/10 border border-[#a78bfa]/25 flex items-center justify-center">
                                <LinkIcon size={13} className="text-[#a78bfa]" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                                    Short link
                                </p>
                                <p className="text-xs font-mono text-[color:var(--text-primary)] truncate">
                                    {shortLink.url}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setShortLink(null);
                                    setFallbackUsed(false);
                                    setShowCustomize(true);
                                }}
                                className="text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors shrink-0"
                            >
                                Change
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] overflow-hidden">
                            <button
                                onClick={() => setShowCustomize((v) => !v)}
                                className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-[color:var(--background-subtle)] transition-colors"
                            >
                                <div className="shrink-0 w-7 h-7 rounded-lg bg-[#a78bfa]/10 border border-[#a78bfa]/25 flex items-center justify-center">
                                    <LinkIcon size={13} className="text-[#a78bfa]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                                        Add a short link
                                    </p>
                                    <p className="text-[11px] text-[color:var(--text-muted)] truncate">
                                        Custom slug &amp; expiry · signed by your wallet
                                    </p>
                                </div>
                                <ChevronDown
                                    size={14}
                                    className={clsx(
                                        "text-[color:var(--text-muted)] transition-transform",
                                        showCustomize && "rotate-180",
                                    )}
                                />
                            </button>
                            {showCustomize && (
                                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[color:var(--border-subtle)]">
                                    {/* Slug */}
                                    <div>
                                        <div
                                            className={clsx(
                                                "flex items-center rounded-lg border bg-[color:var(--background-app)] overflow-hidden focus-within:border-[#a78bfa]/40 transition-colors",
                                                slugError
                                                    ? "border-[color:var(--status-danger)]/40"
                                                    : "border-[color:var(--border-subtle)]",
                                            )}
                                        >
                                            <span className="pl-2.5 pr-1 text-[11px] font-mono text-[color:var(--text-muted)] select-none">
                                                /s/
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
                                                className="flex-1 bg-transparent py-1.5 pr-2 text-xs font-mono text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]/60 focus:outline-none"
                                            />
                                        </div>
                                        {slugError && (
                                            <p className="mt-1 text-[10px] text-[color:var(--status-danger)]">
                                                {slugError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Expiry */}
                                    <div className="flex flex-wrap gap-1">
                                        {EXPIRY_OPTIONS.map((opt) => {
                                            const selected = expiryDays === opt.days;
                                            return (
                                                <button
                                                    key={opt.label}
                                                    type="button"
                                                    onClick={() => setExpiryDays(opt.days)}
                                                    disabled={creating}
                                                    className={clsx(
                                                        "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                                                        selected
                                                            ? "border-[#a78bfa]/40 bg-[#a78bfa]/10 text-[#a78bfa]"
                                                            : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                                                    )}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <button
                                        onClick={handleCreate}
                                        disabled={creating || !!slugError || !account}
                                        className={clsx(
                                            "w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors",
                                            creating || !account
                                                ? "bg-[color:var(--surface-muted)] text-[color:var(--text-muted)] cursor-not-allowed"
                                                : "bg-[#a78bfa] text-[#0a0a0a] hover:bg-[#c4b5fd]",
                                        )}
                                    >
                                        {creating ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin" />
                                                Signing &amp; saving…
                                            </>
                                        ) : !account ? (
                                            "Connect a wallet to shorten"
                                        ) : (
                                            "Create short link"
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {fallbackUsed && shortLink && (
                        <p className="text-[11px] text-[color:var(--text-muted)] leading-relaxed">
                            That slug was taken — using <span className="font-mono text-[color:var(--text-secondary)]">{shortLink.code}</span> instead.
                        </p>
                    )}

                    {error && (
                        <div className="p-2.5 rounded-lg border border-[color:var(--status-danger)]/30 bg-[color:var(--status-danger-soft)] text-[11px] text-[color:var(--status-danger)] flex items-start gap-2">
                            <Icon icon="fluent:warning-24-regular" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="leading-relaxed">{error}</span>
                        </div>
                    )}
                </div>

                {/* Hidden high-res QR used solely for PNG export. Stays
                    out of the layout but is mounted so the canvas exists
                    by the time the user clicks "Image". */}
                <div className="absolute -left-[9999px] top-0 pointer-events-none" aria-hidden>
                    <QRCodeCanvas
                        value={activeUrl}
                        size={480}
                        level="M"
                        marginSize={0}
                        bgColor="#ffffff"
                        fgColor="#0a0a0a"
                        ref={exportQrRef}
                    />
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── tiny presentational helper ───────────────────────────────────────────

interface ActionButtonProps {
    label: string;
    icon: React.ReactNode;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    highlight?: boolean;
}

function ActionButton({ label, icon, onClick, href, disabled, highlight }: ActionButtonProps) {
    const base = clsx(
        "inline-flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium border transition-colors",
        highlight
            ? "border-[#a78bfa]/30 bg-[#a78bfa]/10 text-[#a78bfa]"
            : "border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]",
        disabled && "opacity-60 cursor-not-allowed",
    );
    if (href) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
                {icon}
                {label}
            </a>
        );
    }
    return (
        <button onClick={onClick} disabled={disabled} className={base}>
            {icon}
            {label}
        </button>
    );
}

// ── helpers ──────────────────────────────────────────────────────────────

function slugify(input: string): string {
    return input
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "")
        .slice(0, 32);
}
