"use client";

import React from "react";

// Matches http(s) URLs, bare www.* URLs, and email addresses.
// Conservative: requires a TLD-looking ending, avoids trailing punctuation.
const URL_REGEX =
    /\b((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/**
 * Render a plain-text string with URLs and emails turned into anchor
 * tags. Splits on the URL regex and emits text + link nodes inline.
 * Output is safe: text segments are passed through as React text
 * (auto-escaped), and link `href` values are URL-validated.
 */
export function Linkified({ text, className }: { text: string; className?: string }) {
    if (!text) return null;
    const out: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    URL_REGEX.lastIndex = 0;
    while ((match = URL_REGEX.exec(text)) !== null) {
        if (match.index > lastIndex) {
            out.push(text.slice(lastIndex, match.index));
        }
        const raw = match[0];
        const isEmail = raw.includes("@") && !raw.startsWith("http") && !raw.startsWith("www.");
        let href = "";
        if (isEmail) {
            href = `mailto:${raw}`;
        } else {
            try {
                const candidate = raw.startsWith("http") ? raw : `https://${raw}`;
                const u = new URL(candidate);
                if (u.protocol === "http:" || u.protocol === "https:") {
                    href = u.toString();
                }
            } catch {
                href = "";
            }
        }
        if (href) {
            out.push(
                <a
                    key={`l-${match.index}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#a78bfa] hover:text-[#c4b5fd] underline underline-offset-2 break-words"
                >
                    {raw}
                </a>,
            );
        } else {
            out.push(raw);
        }
        lastIndex = match.index + raw.length;
    }
    if (lastIndex < text.length) {
        out.push(text.slice(lastIndex));
    }
    return <span className={className}>{out}</span>;
}
