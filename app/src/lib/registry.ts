// ─────────────────────────────────────────────────
// On-chain registry client for the Scrolls Move package.
//
// All entry-fn calls go through dApp Kit's `signAndExecuteTransaction`.
// All read queries (events, objects) go through a JSON-RPC `SuiJsonRpcClient`
// because the dApp Kit's grpc client doesn't expose `queryEvents` in a
// stable shape across networks yet.
//
// Every public function gracefully degrades to a friendly error if the
// package isn't deployed on the active network (`hasOnchainRegistry()`
// returns false), which lets the rest of the app keep working in
// "local-only" mode during the testnet → mainnet rollout window.
// ─────────────────────────────────────────────────

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { SCROLLS_NETWORK } from "./dapp-kit";
import {
    SCROLLS_PACKAGE,
    SUI_RPC_URL,
    hasOnchainRegistry,
} from "./contracts";

/**
 * Structural type for the bits of dApp Kit we actually need. Matching by
 * shape rather than the exported `DAppKit<TNetworks, TClient>` generic
 * lets the caller pass either the strongly-typed singleton or the
 * loosely-typed `useDAppKit()` hook return without conflict.
 *
 * The result type follows `SuiJsonRpcClientTypes.TransactionResult` — a
 * discriminated union with the inner `Transaction` carrying the digest.
 */
export interface DAppKitLike {
    signAndExecuteTransaction: (args: {
        transaction: Transaction;
    }) => Promise<unknown>;
}

interface SignedExecResult {
    digest: string;
}

/**
 * Unwrap dApp Kit's `{ $kind: "Transaction", Transaction: { digest, ... } }`
 * (or `{ $kind: "FailedTransaction", FailedTransaction: { digest, ... } }`)
 * into a flat `{ digest }`. Throws on failed transactions so callers
 * never silently drop a revert.
 */
function unwrapExec(raw: unknown): SignedExecResult {
    if (!raw || typeof raw !== "object") {
        throw new Error("signAndExecuteTransaction: empty response");
    }
    const r = raw as {
        $kind?: string;
        Transaction?: { digest?: string; status?: { error?: string } };
        FailedTransaction?: { digest?: string; status?: { error?: string } };
        digest?: string;
    };
    // Some wallets return a flat shape; some return the discriminated union.
    if (r.$kind === "FailedTransaction" && r.FailedTransaction?.digest) {
        const err = r.FailedTransaction.status?.error ?? "transaction failed";
        throw new Error(`Transaction failed: ${err}`);
    }
    const digest =
        r.Transaction?.digest ?? r.FailedTransaction?.digest ?? r.digest;
    if (!digest) {
        throw new Error("signAndExecuteTransaction: missing digest in response");
    }
    return { digest };
}

const CLOCK_ID = "0x6";

let _suiClient: SuiJsonRpcClient | null = null;
function suiClient(): SuiJsonRpcClient {
    if (!_suiClient) {
        _suiClient = new SuiJsonRpcClient({
            url: SUI_RPC_URL,
            network: SCROLLS_NETWORK,
        });
    }
    return _suiClient;
}

function requireDeployed(): void {
    if (!hasOnchainRegistry()) {
        throw new Error(
            `Scrolls Move package is not deployed on ${SCROLLS_NETWORK}. ` +
            `Set the package id in lib/contracts.ts.`,
        );
    }
}

// ── Helpers ─────────────────────────────────────

function blobIdToBytes(blobId: string): number[] {
    return Array.from(new TextEncoder().encode(blobId));
}

/**
 * dApp Kit's `signAndExecuteTransaction` returns the bare digest (after
 * `unwrapExec`) — there are no object changes inline. Fetch the full
 * transaction by digest so we can read `objectChanges` and find the
 * newly-created shared objects.
 *
 * Suffix should be like `::form_pointer::FormPointer`.
 */
async function findCreatedObjectIdByDigest(
    digest: string,
    suffix: string,
): Promise<string | null> {
    const client = suiClient();
    // Wait for the transaction to be indexed by the fullnode. The wallet
    // will have already executed it, but the read endpoint is eventually
    // consistent.
    await client.waitForTransaction({ digest });
    const tx = await client.getTransactionBlock({
        digest,
        options: { showObjectChanges: true },
    });
    for (const ch of tx.objectChanges ?? []) {
        if (
            ch.type === "created" &&
            "objectType" in ch &&
            typeof ch.objectType === "string" &&
            ch.objectType.endsWith(suffix) &&
            "objectId" in ch &&
            typeof ch.objectId === "string"
        ) {
            return ch.objectId;
        }
    }
    return null;
}

// ── Write API ───────────────────────────────────

/**
 * Publish a new form pointer that pins the given Walrus blob id.
 * Returns the shared pointer object id (acts as the cross-device formId).
 */
export async function publishForm(
    dAppKit: DAppKitLike,
    blobId: string,
): Promise<{ pointerId: string; digest: string }> {
    requireDeployed();
    const tx = new Transaction();
    tx.moveCall({
        target: `${SCROLLS_PACKAGE}::form_pointer::publish`,
        arguments: [tx.pure.vector("u8", blobIdToBytes(blobId)), tx.object(CLOCK_ID)],
    });
    const res = unwrapExec(await dAppKit.signAndExecuteTransaction({ transaction: tx }));
    const pointerId = await findCreatedObjectIdByDigest(
        res.digest,
        "::form_pointer::FormPointer",
    );
    if (!pointerId) {
        throw new Error("publishForm: FormPointer object id missing from response");
    }
    return { pointerId, digest: res.digest };
}

/**
 * Owner replaces the current blob (form was edited and republished).
 * Bumps the version field on chain.
 */
export async function updateForm(
    dAppKit: DAppKitLike,
    pointerId: string,
    newBlobId: string,
): Promise<{ digest: string }> {
    requireDeployed();
    const tx = new Transaction();
    tx.moveCall({
        target: `${SCROLLS_PACKAGE}::form_pointer::update`,
        arguments: [
            tx.object(pointerId),
            tx.pure.vector("u8", blobIdToBytes(newBlobId)),
            tx.object(CLOCK_ID),
        ],
    });
    const res = unwrapExec(await dAppKit.signAndExecuteTransaction({ transaction: tx }));
    return { digest: res.digest };
}

/**
 * Anyone records a submission against a form. Freezes a SubmissionRef
 * receipt object and emits the SubmissionRecorded event the owner
 * watches to populate the responses page cross-device.
 */
export async function recordSubmission(
    dAppKit: DAppKitLike,
    pointerId: string,
    submissionBlobId: string,
): Promise<{ digest: string }> {
    requireDeployed();
    const tx = new Transaction();
    tx.moveCall({
        target: `${SCROLLS_PACKAGE}::submission_ref::record`,
        arguments: [
            tx.object(pointerId),
            tx.pure.vector("u8", blobIdToBytes(submissionBlobId)),
            tx.object(CLOCK_ID),
        ],
    });
    const res = unwrapExec(await dAppKit.signAndExecuteTransaction({ transaction: tx }));
    return { digest: res.digest };
}

/**
 * Create a Seal access policy for a private form. Returns the shared
 * policy object id which the form config stores so respondents can
 * encrypt to it.
 */
export async function createPolicy(
    dAppKit: DAppKitLike,
): Promise<{ policyId: string; digest: string }> {
    requireDeployed();
    const tx = new Transaction();
    tx.moveCall({ target: `${SCROLLS_PACKAGE}::seal_policy::create` });
    const res = unwrapExec(await dAppKit.signAndExecuteTransaction({ transaction: tx }));
    const policyId = await findCreatedObjectIdByDigest(
        res.digest,
        "::seal_policy::FormPolicy",
    );
    if (!policyId) {
        throw new Error("createPolicy: FormPolicy object id missing from response");
    }
    return { policyId, digest: res.digest };
}

export async function addAdmin(
    dAppKit: DAppKitLike,
    policyId: string,
    admin: string,
): Promise<{ digest: string }> {
    requireDeployed();
    const tx = new Transaction();
    tx.moveCall({
        target: `${SCROLLS_PACKAGE}::seal_policy::add_admin`,
        arguments: [tx.object(policyId), tx.pure.address(admin)],
    });
    const res = unwrapExec(await dAppKit.signAndExecuteTransaction({ transaction: tx }));
    return { digest: res.digest };
}

export async function removeAdmin(
    dAppKit: DAppKitLike,
    policyId: string,
    admin: string,
): Promise<{ digest: string }> {
    requireDeployed();
    const tx = new Transaction();
    tx.moveCall({
        target: `${SCROLLS_PACKAGE}::seal_policy::remove_admin`,
        arguments: [tx.object(policyId), tx.pure.address(admin)],
    });
    const res = unwrapExec(await dAppKit.signAndExecuteTransaction({ transaction: tx }));
    return { digest: res.digest };
}

// ── Read API ────────────────────────────────────

export interface FormPointerSummary {
    pointerId: string;
    owner: string;
    blobId: string;
    version: number;
    createdAtMs: number;
    updatedAtMs: number;
}

interface FormPublishedFields {
    pointer_id: string;
    owner: string;
    blob_id: number[] | string;
    created_at_ms: string;
}

interface FormUpdatedFields {
    pointer_id: string;
    owner: string;
    new_blob_id: number[] | string;
    version: string;
    updated_at_ms: string;
}

interface SubmissionRecordedFields {
    submission_id: string;
    form_pointer_id: string;
    blob_id: number[] | string;
    submitter: string;
    submitted_at_ms: string;
}

function bytesFieldToString(value: number[] | string | undefined): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    return new TextDecoder().decode(new Uint8Array(value));
}

/**
 * Fetch a form pointer object (owner, current blob, version).
 * Returns null if not found or on the wrong type.
 */
export async function getFormPointer(
    pointerId: string,
): Promise<FormPointerSummary | null> {
    if (!hasOnchainRegistry()) return null;
    try {
        const obj = await suiClient().getObject({
            id: pointerId,
            options: { showContent: true, showType: true },
        });
        const content = obj.data?.content;
        if (!content || content.dataType !== "moveObject") return null;
        const expectedType = `${SCROLLS_PACKAGE}::form_pointer::FormPointer`;
        if (!content.type.endsWith(expectedType.replace(/^0x[0-9a-fA-F]+::/, "::"))) {
            // Type doesn't match — wrong package version or wrong object kind.
            return null;
        }
        const fields = content.fields as Record<string, unknown>;
        return {
            pointerId,
            owner: String(fields.owner),
            blobId: bytesFieldToString(fields.current_blob_id as number[] | string),
            version: Number(fields.version),
            createdAtMs: Number(fields.created_at_ms),
            updatedAtMs: Number(fields.updated_at_ms),
        };
    } catch {
        return null;
    }
}

/**
 * List forms an owner has published (cross-device) by streaming the
 * FormPublished events filtered by sender.
 *
 * Returns newest-first.
 */
export async function getMyForms(owner: string): Promise<FormPointerSummary[]> {
    if (!hasOnchainRegistry()) return [];
    try {
        const events = await suiClient().queryEvents({
            query: {
                MoveEventType: `${SCROLLS_PACKAGE}::form_pointer::FormPublished`,
            },
            order: "descending",
            limit: 200,
        });
        const byPointer = new Map<string, FormPointerSummary>();
        for (const ev of events.data) {
            if (ev.sender !== owner) continue;
            const f = ev.parsedJson as FormPublishedFields | undefined;
            if (!f?.pointer_id) continue;
            // Latest event we see for this pointer wins (events are descending,
            // so the first occurrence is the newest).
            if (!byPointer.has(f.pointer_id)) {
                byPointer.set(f.pointer_id, {
                    pointerId: f.pointer_id,
                    owner: f.owner,
                    blobId: bytesFieldToString(f.blob_id),
                    version: 1,
                    createdAtMs: Number(f.created_at_ms),
                    updatedAtMs: Number(f.created_at_ms),
                });
            }
        }
        // Layer in any updates so the version + current blob is fresh.
        const updates = await suiClient().queryEvents({
            query: {
                MoveEventType: `${SCROLLS_PACKAGE}::form_pointer::FormUpdated`,
            },
            order: "descending",
            limit: 200,
        });
        for (const ev of updates.data) {
            const f = ev.parsedJson as FormUpdatedFields | undefined;
            if (!f?.pointer_id) continue;
            const existing = byPointer.get(f.pointer_id);
            if (!existing) continue;
            const ver = Number(f.version);
            if (ver > existing.version) {
                existing.version = ver;
                existing.blobId = bytesFieldToString(f.new_blob_id);
                existing.updatedAtMs = Number(f.updated_at_ms);
            }
        }
        return Array.from(byPointer.values()).sort(
            (a, b) => b.createdAtMs - a.createdAtMs,
        );
    } catch {
        return [];
    }
}

export interface SubmissionEvent {
    submissionId: string;
    pointerId: string;
    blobId: string;
    submitter: string;
    submittedAtMs: number;
}

/**
 * Stream all SubmissionRecorded events for a given pointer.
 * Returns newest-first, deduped by submission id.
 */
export async function getSubmissionsForForm(
    pointerId: string,
    limit = 200,
): Promise<SubmissionEvent[]> {
    if (!hasOnchainRegistry()) return [];
    try {
        const events = await suiClient().queryEvents({
            query: {
                MoveEventType: `${SCROLLS_PACKAGE}::submission_ref::SubmissionRecorded`,
            },
            order: "descending",
            limit,
        });
        const out: SubmissionEvent[] = [];
        const seen = new Set<string>();
        for (const ev of events.data) {
            const f = ev.parsedJson as SubmissionRecordedFields | undefined;
            if (!f?.form_pointer_id || f.form_pointer_id !== pointerId) continue;
            const id = f.submission_id;
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({
                submissionId: id,
                pointerId: f.form_pointer_id,
                blobId: bytesFieldToString(f.blob_id),
                submitter: f.submitter,
                submittedAtMs: Number(f.submitted_at_ms),
            });
        }
        return out;
    } catch {
        return [];
    }
}

/** Heuristic: a form id starting with `0x` is a Sui object id (FormPointer). */
export function isPointerId(id: string): boolean {
    return /^0x[0-9a-fA-F]{1,64}$/.test(id);
}

export interface FormPolicySummary {
    policyId: string;
    owner: string;
    admins: string[];
}

/**
 * Fetch a Seal `FormPolicy` shared object so the responses page can
 * render the current admin allowlist. Returns null when the object
 * doesn't exist on this network.
 */
export async function getPolicy(policyId: string): Promise<FormPolicySummary | null> {
    if (!hasOnchainRegistry()) return null;
    try {
        const obj = await suiClient().getObject({
            id: policyId,
            options: { showContent: true, showType: true },
        });
        const content = obj.data?.content;
        if (!content || content.dataType !== "moveObject") return null;
        const expectedSuffix = "::seal_policy::FormPolicy";
        if (!content.type.endsWith(expectedSuffix)) return null;
        const fields = content.fields as Record<string, unknown>;
        const admins = Array.isArray(fields.admins) ? (fields.admins as string[]) : [];
        return {
            policyId,
            owner: String(fields.owner),
            admins,
        };
    } catch {
        return null;
    }
}
