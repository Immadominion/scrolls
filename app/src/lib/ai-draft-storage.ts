// IndexedDB draft storage for AI form generation with attachments.

import { randomUUID } from "@/lib/uuid";

const DB_NAME = "scrolls-ai";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

const MAX_DRAFT_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface StoredAttachment {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    blob: Blob;
}

interface StoredDraft {
    id: string;
    prompt: string;
    createdAt: string;
    attachments: StoredAttachment[];
}

export interface AIDraft {
    id: string;
    prompt: string;
    createdAt: string;
    attachments: File[];
}

export async function saveAIDraft(prompt: string, attachments: File[]): Promise<string> {
    const db = await openDB();
    const id = randomUUID();
    const payload: StoredDraft = {
        id,
        prompt,
        createdAt: new Date().toISOString(),
        attachments: attachments.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            blob: file,
        })),
    };

    await runTransaction(db, "readwrite", (store) => store.put(payload));
    await pruneOldDrafts(db);
    return id;
}

export async function loadAIDraft(id: string): Promise<AIDraft | null> {
    const db = await openDB();
    const stored = await runTransaction<StoredDraft | undefined>(
        db,
        "readonly",
        (store) => store.get(id),
    );

    if (!stored) return null;

    return {
        id: stored.id,
        prompt: stored.prompt,
        createdAt: stored.createdAt,
        attachments: stored.attachments.map((att) =>
            new File([att.blob], att.name, {
                type: att.type,
                lastModified: att.lastModified,
            }),
        ),
    };
}

export async function deleteAIDraft(id: string): Promise<void> {
    const db = await openDB();
    await runTransaction(db, "readwrite", (store) => store.delete(id));
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
}

function runTransaction<T = void>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = action(store) as IDBRequest<T> | undefined;

        tx.oncomplete = () => {
            if (request) {
                resolve(request.result);
            } else {
                resolve(undefined as T);
            }
        };
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
}

async function pruneOldDrafts(db: IDBDatabase): Promise<void> {
    const now = Date.now();
    const allDrafts = await runTransaction<StoredDraft[]>(db, "readonly", (store) =>
        store.getAll(),
    );

    const staleIds = allDrafts
        .filter((d) => now - new Date(d.createdAt).getTime() > MAX_DRAFT_AGE_MS)
        .map((d) => d.id);

    if (staleIds.length === 0) return;

    await runTransaction(db, "readwrite", (store) => {
        for (const id of staleIds) {
            store.delete(id);
        }
    });
}
