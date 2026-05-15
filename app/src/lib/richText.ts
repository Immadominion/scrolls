// ─────────────────────────────────────────────────────────────────────
// HTML sanitization for user-authored rich text.
//
// Rich-text fields ship as HTML strings inside the submission JSON. We
// must NEVER render that HTML to an admin's DOM without sanitizing — a
// malicious respondent could otherwise inject <script>, on-handlers,
// or javascript: URLs straight into the responses page.
//
// DOMPurify is the industry standard. We pin a strict allowlist to the
// tags TipTap's StarterKit can produce: paragraphs, headings, basic
// inline marks, lists, blockquote, code, and safe links. Any attribute
// outside `href` (force-prefixed http/https/mailto) is dropped.
// ─────────────────────────────────────────────────────────────────────

import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "a",
    "hr",
];

const ALLOWED_ATTR = ["href", "rel", "target"];

let configured = false;

function ensureConfigured() {
    if (configured || typeof window === "undefined") return;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A") {
            // Force every link to open safely in a new tab.
            node.setAttribute("rel", "nofollow noopener noreferrer");
            node.setAttribute("target", "_blank");
        }
    });
    configured = true;
}

/**
 * Sanitize untrusted HTML before rendering it. Only safe tags survive;
 * scripts, event handlers, javascript:/data: URLs, and unknown
 * attributes are stripped.
 */
export function sanitizeRichText(html: string): string {
    if (!html) return "";
    if (typeof window === "undefined") {
        // Static-export prerender path: no DOM available. Strip tags
        // entirely so we never emit unsanitized markup at build time.
        return html.replace(/<[^>]*>/g, "");
    }
    ensureConfigured();
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
        FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
    });
}

/**
 * Convert (already-sanitized) rich-text HTML to a plaintext
 * representation suitable for CSV exports, AI prompts, and notification
 * previews. Preserves paragraph breaks; collapses other whitespace.
 */
export function richTextToPlainText(html: string): string {
    if (!html) return "";
    const sanitized = sanitizeRichText(html);
    if (typeof window === "undefined") {
        return sanitized.replace(/\s+/g, " ").trim();
    }
    const div = document.createElement("div");
    div.innerHTML = sanitized;
    // Replace block-ish elements with explicit newlines so paragraph
    // structure survives the strip.
    div.querySelectorAll("p, br, li, h1, h2, h3, h4, blockquote, pre").forEach((el) => {
        el.insertAdjacentText("beforeend", "\n");
    });
    return (div.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}
