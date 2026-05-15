// ─────────────────────────────────────────────────
// AI Form Builder — Claude Haiku
// Generates a FormConfig draft from a natural-language prompt, optionally
// augmented with multimodal attachment context.
//
// SECURITY: Anthropic credentials must stay in the Worker proxy.
// ─────────────────────────────────────────────────

import type { FieldType, FormConfig, FormField } from "@/types";
import {
    encodeAttachmentsForClaude,
    type AIContentBlock,
} from "@/lib/ai-attachments";
import { randomUUID } from "@/lib/uuid";

const CLAUDE_PROXY_URL = process.env.NEXT_PUBLIC_CLAUDE_PROXY_URL ?? "";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

const VALID_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
    "short_text",
    "long_text",
    "rich_text",
    "dropdown",
    "multi_select",
    "star_rating",
    "file_upload",
    "video_upload",
    "url",
    "confirm_checkbox",
]);

// ── Schema returned by the model ──────────────────

interface AIField {
    type: FieldType;
    label: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
    maxStars?: number;
}

interface AIFormDraft {
    title: string;
    description?: string;
    isPrivate?: boolean;
    allowAnonymous?: boolean;
    fields: AIField[];
}

const SYSTEM_PROMPT = `You are an expert form designer for Scrolls, a Walrus-native form platform.

Given a natural-language brief, produce a tight, well-structured form. Choose
the smallest number of fields that actually capture what the brief asks for.
Avoid filler fields. Use clear, human labels (no jargon, no emoji).

Available field types:
- short_text         single-line text (names, titles, short answers)
- long_text          multi-line text (descriptions, feedback, steps to reproduce)
- rich_text          rich text editor (long-form content)
- dropdown           single choice from a list (provide "options")
- multi_select       multiple choices (provide "options")
- star_rating        1-N star rating (set "maxStars", default 5)
- file_upload        document/image upload
- video_upload       video upload
- url                URL input (links, demos, portfolios)
- confirm_checkbox   single confirmation checkbox (terms, opt-in)

Privacy:
- Set "isPrivate": true when the brief implies confidentiality
  (medical, legal, financial, hiring, internal feedback).
- Set "allowAnonymous": false when the brief implies the responder must
  be identifiable (job application, grant application). Otherwise true.

Respond ONLY with valid JSON matching this schema, no prose, no markdown fences:
{
  "title": string,
  "description": string,
  "isPrivate": boolean,
  "allowAnonymous": boolean,
  "fields": [
    {
      "type": "short_text" | "long_text" | "rich_text" | "dropdown" | "multi_select" | "star_rating" | "file_upload" | "video_upload" | "url" | "confirm_checkbox",
      "label": string,
      "required": boolean,
      "placeholder": string,
      "options": string[],   // only for dropdown / multi_select
      "maxStars": number     // only for star_rating
    }
  ]
}`;

// ── Public API ────────────────────────────────────

export interface GeneratedForm {
    config: FormConfig;
    source: "claude-haiku";
    /** How many attachments were embedded into the prompt context. */
    usedAttachmentCount: number;
    /** How many of those were transcribed audio/video clips. */
    transcribedAttachmentCount: number;
    /** Files we couldn't use, with the reason. */
    skippedAttachments: { filename: string; reason: string }[];
}

/**
 * Generate a draft `FormConfig` from a natural-language prompt.
 * Uses Claude Haiku via the configured proxy.
 * Throws if the proxy is not configured or the call fails — no fallbacks.
 */
export async function generateFormFromPrompt(
    prompt: string,
    attachments: File[] = [],
): Promise<GeneratedForm> {
    const trimmed = prompt.trim();
    if (!trimmed) {
        throw new Error("Prompt is empty");
    }

    if (!CLAUDE_PROXY_URL) {
        throw new Error(
            "Claude proxy URL not configured. Set NEXT_PUBLIC_CLAUDE_PROXY_URL to enable AI form generation."
        );
    }

    const { draft, attachmentTrace } = await callClaudeProxy(trimmed, attachments);
    return {
        config: draftToConfig(draft),
        source: "claude-haiku",
        usedAttachmentCount: attachmentTrace.usedCount,
        transcribedAttachmentCount: attachmentTrace.transcribedCount,
        skippedAttachments: attachmentTrace.skipped,
    };
}

// ── Claude proxy call ─────────────────────────────

async function callClaudeProxy(
    prompt: string,
    attachments: File[],
): Promise<{
    draft: AIFormDraft;
    attachmentTrace: {
        usedCount: number;
        transcribedCount: number;
        skipped: { filename: string; reason: string }[];
    };
}> {
    const userBlocks: AIContentBlock[] = [{ type: "text", text: prompt }];
    let attachmentTrace = { usedCount: 0, transcribedCount: 0, skipped: [] as { filename: string; reason: string }[] };

    if (attachments.length > 0) {
        const transcribeUrl = new URL("/transcribe", CLAUDE_PROXY_URL).toString();
        const encoded = await encodeAttachmentsForClaude(attachments, { transcribeUrl });
        userBlocks.push(...encoded.blocks);
        attachmentTrace = {
            usedCount: encoded.usedCount,
            transcribedCount: encoded.transcribedCount,
            skipped: encoded.skipped,
        };

        if (encoded.skipped.length > 0) {
            const skippedSummary = encoded.skipped
                .map((item) => `${item.filename}: ${item.reason}`)
                .join("\n");
            userBlocks.push({
                type: "text",
                text: `Some attachments were skipped:\n${skippedSummary}`,
            });
        }
    }

    const res = await fetch(CLAUDE_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userBlocks }],
        }),
    });

    if (!res.ok) {
        throw new Error(`Claude proxy error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
    };

    const text = json.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) throw new Error("Claude proxy returned empty response");

    // Strip accidental code-fence wrappers
    const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const parsed = JSON.parse(cleaned) as AIFormDraft;
    if (!parsed || !Array.isArray(parsed.fields)) {
        throw new Error("Claude proxy returned invalid draft");
    }
    return { draft: parsed, attachmentTrace };
}

// ── Draft → FormConfig ────────────────────────────

function draftToConfig(draft: AIFormDraft): FormConfig {
    const now = new Date().toISOString();
    const fields: FormField[] = (draft.fields ?? [])
        .filter((f) => f && VALID_TYPES.has(f.type))
        .map((f) => toFormField(f));

    return {
        id: randomUUID(),
        title: (draft.title ?? "Untitled form").trim() || "Untitled form",
        description: draft.description?.trim() ?? "",
        fields,
        settings: {
            isPrivate: draft.isPrivate ?? false,
            allowAnonymous: draft.allowAnonymous ?? true,
        },
        createdAt: now,
        updatedAt: now,
        ownerAddress: "",
    };
}

function toFormField(f: AIField): FormField {
    const base = {
        id: randomUUID(),
        type: f.type,
        label: f.label?.trim() || "Untitled field",
        required: !!f.required,
        placeholder: f.placeholder?.trim() || undefined,
    } as FormField;

    if (f.type === "dropdown" || f.type === "multi_select") {
        const opts = (f.options ?? []).filter((o) => o && o.trim());
        return {
            ...base,
            options: (opts.length ? opts : ["Option 1", "Option 2"]).map((label) => ({
                id: randomUUID(),
                label: label.trim(),
            })),
        };
    }
    if (f.type === "star_rating") {
        const maxStars = f.maxStars && f.maxStars >= 2 && f.maxStars <= 10 ? f.maxStars : 5;
        return { ...base, maxStars };
    }
    return base;
}
