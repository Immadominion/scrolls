// Helpers for validating and encoding AI attachments for Claude messages.

export interface AIAttachmentError {
    filename: string;
    reason: string;
}

export interface AITextBlock {
    type: "text";
    text: string;
}

export interface AIImageBlock {
    type: "image";
    source: {
        type: "base64";
        media_type: string;
        data: string;
    };
}

export interface AIDocumentBlock {
    type: "document";
    source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
    };
}

export type AIContentBlock = AITextBlock | AIImageBlock | AIDocumentBlock;

export interface AttachmentEncodingResult {
    blocks: AIContentBlock[];
    usedCount: number;
    /** How many of the used attachments were transcribed audio/video. */
    transcribedCount: number;
    skipped: AIAttachmentError[];
}

export interface EncodeOptions {
    /** Full URL to the Whisper /transcribe endpoint. Required to use audio/video. */
    transcribeUrl?: string;
}

export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB each (audio/video need headroom)
export const MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB total

export function validateAttachments(files: File[]): string | null {
    if (files.length > MAX_ATTACHMENTS) {
        return `Attach up to ${MAX_ATTACHMENTS} files per draft.`;
    }

    let total = 0;
    for (const file of files) {
        total += file.size;
        if (file.size > MAX_ATTACHMENT_BYTES) {
            return `${file.name} is larger than 25MB.`;
        }
    }

    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        return "Total attachment size must be 50MB or less.";
    }

    return null;
}

export async function encodeAttachmentsForClaude(
    files: File[],
    options: EncodeOptions = {},
): Promise<AttachmentEncodingResult> {
    const blocks: AIContentBlock[] = [];
    const skipped: AIAttachmentError[] = [];
    let usedCount = 0;
    let transcribedCount = 0;

    for (const file of files) {
        if (file.type.startsWith("image/")) {
            const data = await fileToBase64(file);
            blocks.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: file.type || "image/png",
                    data,
                },
            });
            usedCount += 1;
            continue;
        }

        if (file.type === "application/pdf") {
            const data = await fileToBase64(file);
            blocks.push({
                type: "document",
                source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data,
                },
            });
            usedCount += 1;
            continue;
        }

        if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
            if (!options.transcribeUrl) {
                skipped.push({
                    filename: file.name,
                    reason: "Audio/video transcription endpoint not configured.",
                });
                continue;
            }
            try {
                const transcript = await transcribeFile(file, options.transcribeUrl);
                if (!transcript) {
                    skipped.push({
                        filename: file.name,
                        reason: "Transcription returned no text.",
                    });
                    continue;
                }
                blocks.push({
                    type: "text",
                    text: `Transcript of ${file.name} (${file.type}):\n\n${transcript}`,
                });
                usedCount += 1;
                transcribedCount += 1;
            } catch (err) {
                skipped.push({
                    filename: file.name,
                    reason: `Transcription failed: ${(err as Error).message}`,
                });
            }
            continue;
        }

        if (isTextLike(file)) {
            const text = await file.text();
            const trimmed = text.trim();
            const clipped = trimmed.length > 12000 ? `${trimmed.slice(0, 12000)}\n...[truncated]` : trimmed;
            blocks.push({
                type: "text",
                text: `Attachment: ${file.name}\n\n${clipped || "[empty file]"}`,
            });
            usedCount += 1;
            continue;
        }

        skipped.push({
            filename: file.name,
            reason: "Unsupported file type for Claude context.",
        });
    }

    return { blocks, usedCount, transcribedCount, skipped };
}

async function transcribeFile(file: File, url: string): Promise<string> {
    const form = new FormData();
    form.set("file", file, file.name || "attachment");
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
}

function isTextLike(file: File): boolean {
    if (file.type.startsWith("text/")) return true;
    return [
        "application/json",
        "application/xml",
        "application/javascript",
    ].includes(file.type);
}

async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
        binary += String.fromCharCode(...sub);
    }
    return btoa(binary);
}
