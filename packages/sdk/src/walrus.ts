// ─────────────────────────────────────────────────
// Walrus HTTP client (Node)
//
// Mirrors `app/src/lib/walrus.ts` but stripped of browser-only types so
// the SDK runs in Node 20+ without WASM. Uses the same public publisher
// + aggregator topology that the web app uses.
// ─────────────────────────────────────────────────

const UPLOAD_RETRIES = 2;
const FETCH_RETRIES = 2;

export interface WalrusEndpoints {
    publisher: string;
    aggregator: string;
    epochs: number;
}

interface WalrusPublishResponse {
    newlyCreated?: { blobObject: { blobId: string } };
    alreadyCertified?: { blobId: string };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload raw bytes to a Walrus publisher. Stores the blob as permanent
 * (non-deletable) which matches Scrolls' "permanent record" semantics.
 */
export async function uploadBlob(
    endpoints: WalrusEndpoints,
    data: Uint8Array,
    mimeType: string,
): Promise<string> {
    const url = `${endpoints.publisher}/v1/blobs?epochs=${endpoints.epochs}&permanent=true`;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": mimeType },
                // Node's fetch accepts Uint8Array directly; cast to BodyInit for TS.
                body: data as unknown as BodyInit,
            });

            if (!res.ok) {
                if (res.status >= 500 && attempt < UPLOAD_RETRIES) {
                    await sleep(400 * (attempt + 1));
                    continue;
                }
                const text = await res.text().catch(() => "");
                throw new Error(
                    `Walrus upload failed: ${res.status} ${res.statusText} ${text}`.trim(),
                );
            }

            const json = (await res.json()) as WalrusPublishResponse;
            const blobId =
                json.newlyCreated?.blobObject.blobId ??
                json.alreadyCertified?.blobId;

            if (!blobId) {
                throw new Error("Walrus upload: could not parse blobId from response");
            }
            return blobId;
        } catch (err) {
            lastErr = err;
            if (err instanceof TypeError && attempt < UPLOAD_RETRIES) {
                await sleep(400 * (attempt + 1));
                continue;
            }
            throw err;
        }
    }

    throw lastErr instanceof Error ? lastErr : new Error("Walrus upload failed");
}

export async function uploadJSON(
    endpoints: WalrusEndpoints,
    data: unknown,
): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return uploadBlob(endpoints, bytes, "application/json");
}

export async function fetchBlob(
    endpoints: WalrusEndpoints,
    blobId: string,
): Promise<Uint8Array> {
    const url = `${endpoints.aggregator}/v1/blobs/${encodeURIComponent(blobId)}`;
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

export async function fetchJSON<T>(
    endpoints: WalrusEndpoints,
    blobId: string,
): Promise<T> {
    const bytes = await fetchBlob(endpoints, blobId);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
}

export function blobUrl(endpoints: WalrusEndpoints, blobId: string): string {
    return `${endpoints.aggregator}/v1/blobs/${encodeURIComponent(blobId)}`;
}
