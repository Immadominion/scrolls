// ─────────────────────────────────────────────────────────────────────
// Hardened form-decryption key store.
//
// Browsers can persist a `CryptoKey` *object* directly in IndexedDB
// without ever surfacing the raw key material to JavaScript. We import
// the form owner's ECDH private key with `extractable: false`, store
// the resulting `CryptoKey` in IDB, and discard the JWK from
// localStorage. Decryption then derives the AES key directly inside the
// browser's crypto core — JS never sees the private bytes again.
//
// The fundamental XSS risk does not disappear (an attacker with script
// execution can still call `decrypt`), but raw key exfiltration becomes
// impossible, which dramatically slows automated theft and makes any
// stolen credential useless off-origin.
// ─────────────────────────────────────────────────────────────────────

const DB_NAME = "scrolls-keys";
const DB_VERSION = 1;
const STORE = "form-private-keys";

function isAvailable(): boolean {
    return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    });
}

async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await openDB();
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const store = tx.objectStore(STORE);
            const req = fn(store);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        });
    } finally {
        db.close();
    }
}

/**
 * Import a JWK as a non-extractable ECDH `CryptoKey` and persist it in
 * IndexedDB. Returns true on success. Falls back to false when
 * IndexedDB or `crypto.subtle` is unavailable so callers can keep the
 * legacy JWK path as a backstop.
 */
export async function storeHardenedFormPrivateKey(
    formId: string,
    jwk: JsonWebKey,
): Promise<boolean> {
    if (!isAvailable() || typeof crypto === "undefined" || !crypto.subtle) {
        return false;
    }
    try {
        const key = await crypto.subtle.importKey(
            "jwk",
            jwk,
            { name: "ECDH", namedCurve: "P-256" },
            /* extractable */ false,
            ["deriveKey", "deriveBits"],
        );
        await withStore("readwrite", (store) => store.put(key, formId));
        return true;
    } catch {
        return false;
    }
}

/**
 * Load a previously hardened key. Returns `null` if no hardened key is
 * present for this form (callers should then fall back to the legacy
 * localStorage JWK path).
 */
export async function loadHardenedFormPrivateKey(
    formId: string,
): Promise<CryptoKey | null> {
    if (!isAvailable()) return null;
    try {
        const value = await withStore<unknown>("readonly", (store) => store.get(formId));
        if (!value) return null;
        // Structured clone of CryptoKey is supported in all modern browsers.
        return value as CryptoKey;
    } catch {
        return null;
    }
}

export async function removeHardenedFormPrivateKey(formId: string): Promise<void> {
    if (!isAvailable()) return;
    try {
        await withStore("readwrite", (store) => store.delete(formId));
    } catch {
        // best-effort cleanup
    }
}
