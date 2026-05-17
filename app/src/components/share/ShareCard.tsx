"use client";

import { forwardRef } from "react";
import clsx from "clsx";
import { Icon } from "@iconify/react";
import { QRCodeCanvas } from "qrcode.react";

export interface ShareCardProps {
    title: string;
    /** The URL the QR encodes and the URL shown beneath it. */
    url: string;
    /** Optional small subtitle above the title, e.g. "Form published" or "Scrolls form". */
    eyebrow?: string;
    isPrivate?: boolean;
    /** Long-form Walrus blob id for the footer line. */
    blobId?: string;
    /** Display-only — used to render the friendly short slug below the URL. */
    shortCode?: string | null;
    className?: string;
    /** Forces the on-card text to wrap nicely even for long titles. */
    compact?: boolean;
}

/**
 * Vercel-style share card. Receipt-texture background, dark glass panel,
 * scannable QR. The visible component is HTML + an embedded canvas QR;
 * `downloadShareCardPng()` in `lib/cardImage.ts` re-renders the same
 * content to a 1080×1350 PNG for sharing.
 *
 * The component is wrapped in `forwardRef` so callers can grab the root
 * node for hover effects or layout measurement, but PNG export does NOT
 * rasterize the DOM — see `lib/cardImage.ts`.
 */
const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
    { title, url, eyebrow = "Scrolls", isPrivate, blobId, shortCode, className, compact },
    ref,
) {
    const displayUrl = stripScheme(url);
    return (
        <div
            ref={ref}
            className={clsx(
                "relative w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl",
                "aspect-[4/5]",
                className,
            )}
        >
            {/* Receipt texture background */}
            <div
                aria-hidden
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: "url('/receipt-texture.png')" }}
            />
            {/* Vignette + tint so on-card text is always legible against the
                bold texture, regardless of where the topographic lines land. */}
            <div
                aria-hidden
                className="absolute inset-0"
                style={{
                    background:
                        "linear-gradient(180deg, rgba(10,10,10,0.25) 0%, rgba(10,10,10,0.55) 55%, rgba(10,10,10,0.85) 100%)",
                }}
            />

            {/* Content frame */}
            <div className="relative flex h-full flex-col p-5 sm:p-6 text-white">
                {/* Top row: brand + privacy badge */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span
                            aria-hidden
                            className="inline-flex w-5 h-5 items-center justify-center text-[#a78bfa]"
                        >
                            {/* 4-point twisted star glyph */}
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                                <path d="M12 1.5 13.6 9 21 10.4 15 15.6 17.1 22.5 12 18.3 6.9 22.5 9 15.6 3 10.4 10.4 9Z" />
                            </svg>
                        </span>
                        <span className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-white/90">
                            {eyebrow}
                        </span>
                    </div>
                    {isPrivate ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#06b6d4]/15 px-2 py-0.5 text-[10px] font-medium text-[#06b6d4] ring-1 ring-inset ring-[#06b6d4]/30">
                            <Icon icon="fluent:lock-closed-12-regular" className="w-3 h-3" />
                            Encrypted
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80 ring-1 ring-inset ring-white/15">
                            <Icon icon="fluent:globe-12-regular" className="w-3 h-3" />
                            Public
                        </span>
                    )}
                </div>

                {/* Title block */}
                <div className="mt-6 sm:mt-8 flex-1">
                    <p className="text-[11px] uppercase tracking-wider text-white/55">
                        Form is live
                    </p>
                    <h3
                        className={clsx(
                            "mt-2 font-display font-bold leading-[1.05] text-white drop-shadow-sm",
                            compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl",
                            "line-clamp-3",
                        )}
                    >
                        {title || "Untitled form"}
                    </h3>
                </div>

                {/* QR + URL */}
                <div className="mt-4 flex items-end gap-4">
                    <div className="shrink-0 rounded-xl bg-white p-2.5 ring-1 ring-black/10">
                        <QRCodeCanvas
                            value={url}
                            size={104}
                            level="M"
                            marginSize={0}
                            bgColor="#ffffff"
                            fgColor="#0a0a0a"
                        />
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                        <p className="text-[10px] uppercase tracking-wider text-white/55 mb-1">
                            Scan or visit
                        </p>
                        <p className="font-mono text-[13px] leading-snug break-all text-white">
                            {displayUrl}
                        </p>
                        {shortCode && (
                            <p className="mt-1 text-[10px] font-mono text-[#a78bfa]/90">
                                /s/{shortCode}
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer meta */}
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2 text-[10px] text-white/55">
                    <span className="inline-flex items-center gap-1">
                        <Icon icon="fluent:cloud-checkmark-24-regular" className="w-3 h-3" />
                        Permanent on Walrus
                    </span>
                    {blobId && (
                        <span className="font-mono truncate text-white/40">
                            {blobId.slice(0, 10)}…{blobId.slice(-4)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});

export default ShareCard;

function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//i, "");
}
