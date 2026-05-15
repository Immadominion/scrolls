// ─────────────────────────────────────────────────
// Walrus Storage Layer
// Browser → Walrus aggregator/publisher (no server)
// ─────────────────────────────────────────────────

import type { WalrusBlobRef } from "@/types";

const PUBLISHER_URL =
    process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
    "https://publisher.walrus-testnet.walrus.space";

const AGGREGATOR_URL =
    process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
    "https://aggregator.walrus-testnet.walrus.space";

/** Store epochs for blobs (default: ~30 days on testnet) */
const DEFAULT_EPOCHS = Number(process.env.NEXT_PUBLIC_WALRUS_EPOCHS ?? "5");

/** Hard ceiling for browser uploads (publisher accepts more, but this keeps the UX safe) */
export const MAX_FILE_SIZE_MB = 50;

/** Default retry attempts on transient publisher / aggregator errors (5xx / network) */
const UPLOAD_RETRIES = 2;
const FETCH_RETRIES = 2;

// ── Upload ─────────────────────────────────────────

/**
 * Upload raw bytes to Walrus. Returns the blob ID.
 * Retries on transient errors (5xx + network failures). Throws otherwise.
 */
export async function uploadBlob(
    data: Uint8Array,
    mimeType: string,
): Promise<string> {
    // permanent=true makes the blob non-deletable by the publisher's wallet,
    // which matches Scrolls' "permanent record" value prop. Newly stored blobs
    // are deletable by default on Walrus.
    const url = `${PUBLISHER_URL}/v1/blobs?epochs=${DEFAULT_EPOCHS}&permanent=true`;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": mimeType },
                body: data as unknown as BodyInit,
            });

            // Retry only on 5xx (server / publisher trouble); 4xx is permanent
            if (!res.ok) {
                if (res.status >= 500 && attempt < UPLOAD_RETRIES) {
                    await sleep(400 * (attempt + 1));
                    continue;
                }
                throw new Error(`Walrus upload failed: ${res.status} ${res.statusText}`);
            }

            const json = (await res.json()) as {
                newlyCreated?: { blobObject: { blobId: string } };
                alreadyCertified?: { blobId: string };
            };

            const blobId =
                json.newlyCreated?.blobObject.blobId ??
                json.alreadyCertified?.blobId;

            if (!blobId) {
                throw new Error("Walrus upload: could not parse blobId from response");
            }

            return blobId;
        } catch (err) {
            lastErr = err;
            // Network failure (TypeError from fetch) — retry
            if (err instanceof TypeError && attempt < UPLOAD_RETRIES) {
                await sleep(400 * (attempt + 1));
                continue;
            }
            throw err;
        }
    }

    throw lastErr instanceof Error ? lastErr : new Error("Walrus upload failed");
}

/**
 * Upload a File or Blob object. Returns a WalrusBlobRef.
 * Enforces MAX_FILE_SIZE_MB; pass `maxSizeMB` to override.
 */
export async function uploadFile(
    file: File,
    maxSizeMB: number = MAX_FILE_SIZE_MB,
): Promise<WalrusBlobRef> {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
        throw new Error(
            `File is ${sizeMB.toFixed(1)} MB — limit is ${maxSizeMB} MB.`,
        );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Fall back to octet-stream when the OS can't infer a mime type
    const mimeType = file.type || "application/octet-stream";
    const blobId = await uploadBlob(bytes, mimeType);
    return {
        blobId,
        mimeType,
        sizeBytes: file.size,
        filename: file.name,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a JSON-serialisable object. Returns the blob ID.
 */
export async function uploadJSON(data: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return uploadBlob(bytes, "application/json");
}

// ── Download ───────────────────────────────────────

/**
 * Fetch raw bytes from a Walrus blob.
 * Retries on transient 5xx / network failures — public aggregators can be flaky.
 */
export async function fetchBlob(blobId: string): Promise<Uint8Array> {
    const url = `${AGGREGATOR_URL}/v1/blobs/${encodeURIComponent(blobId)}`;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                if (res.status >= 500 && attempt < FETCH_RETRIES) {
                    await sleep(400 * (attempt + 1));
                    continue;
                }
                throw new Error(
                    `Walrus fetch failed: ${res.status} ${res.statusText}`,
                );
            }
            const buf = await res.arrayBuffer();
            return new Uint8Array(buf);
        } catch (err) {
            lastErr = err;
            if (err instanceof TypeError && attempt < FETCH_RETRIES) {
                await sleep(400 * (attempt + 1));
                continue;
            }
            throw err;
        }
    }

    throw lastErr instanceof Error ? lastErr : new Error("Walrus fetch failed");
}

/**
 * Fetch and parse a JSON blob.
 */
export async function fetchJSON<T>(blobId: string): Promise<T> {
    const bytes = await fetchBlob(blobId);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
}

/**
 * Build the public URL for a Walrus blob (for use in <img> / <video> tags).
 * Use this instead of next/image for Walrus-hosted media.
 */
export function blobUrl(blobId: string): string {
    return `${AGGREGATOR_URL}/v1/blobs/${encodeURIComponent(blobId)}`;
}
