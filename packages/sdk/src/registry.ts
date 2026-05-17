// ─────────────────────────────────────────────────
// Sui on-chain registry client (Node)
//
// Phase-2 equivalent of `app/src/lib/registry.ts` for headless
// environments. Signs and submits transactions with an Ed25519 keypair
// loaded from a bech32 (`suiprivkey1…`) private key.
//
// Reads (events, objects) use the standard JSON-RPC client and work
// even without a signer configured.
// ─────────────────────────────────────────────────

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import type { ScrollsNetwork } from "./types.js";

const CLOCK_ID = "0x6";

export interface RegistryConfig {
    network: ScrollsNetwork;
    rpcUrl: string;
    packageId: string;
    /** Optional bech32-encoded private key (`suiprivkey1…`). */
    privateKey?: string;
}

export interface FormPointerSummary {
    pointerId: string;
    owner: string;
    blobId: string;
    version: number;
    createdAtMs: number;
    updatedAtMs: number;
}

export interface SubmissionEvent {
    submissionId: string;
    pointerId: string;
    blobId: string;
    submitter: string;
    submittedAtMs: number;
}

export interface FormPolicySummary {
    policyId: string;
    owner: string;
    admins: string[];
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

export class Registry {
    readonly client: SuiJsonRpcClient;
    readonly packageId: string;
    readonly network: ScrollsNetwork;
    private readonly keypair?: Ed25519Keypair;

    constructor(cfg: RegistryConfig) {
        this.client = new SuiJsonRpcClient({ url: cfg.rpcUrl, network: cfg.network });
        this.packageId = cfg.packageId;
        this.network = cfg.network;
        if (cfg.privateKey) {
            this.keypair = loadKeypair(cfg.privateKey);
        }
    }

    /** Is the Move package configured on this network? */
    get deployed(): boolean {
        return !!this.packageId;
    }

    /** Public Sui address derived from the signer, if any. */
    address(): string | null {
        return this.keypair?.toSuiAddress() ?? null;
    }

    private requireSigner(): Ed25519Keypair {
        if (!this.keypair) {
            throw new Error(
                "No Sui signer configured. Set `suiPrivateKey` in your config or run `scrolls init`.",
            );
        }
        return this.keypair;
    }

    private requireDeployed(): void {
        if (!this.deployed) {
            throw new Error(
                `Scrolls Move package is not deployed on ${this.network}. ` +
                `Set the package id in your config.`,
            );
        }
    }

    // ── Write API ────────────────────────────────

    async publishForm(blobId: string): Promise<{ pointerId: string; digest: string }> {
        this.requireDeployed();
        const keypair = this.requireSigner();
        const tx = new Transaction();
        tx.moveCall({
            target: `${this.packageId}::form_pointer::publish`,
            arguments: [
                tx.pure.vector("u8", blobIdToBytes(blobId)),
                tx.object(CLOCK_ID),
            ],
        });
        const { digest } = await this.signAndExecute(tx, keypair);
        const pointerId = await this.findCreatedObject(digest, "::form_pointer::FormPointer");
        if (!pointerId) {
            throw new Error("publishForm: FormPointer object id missing from response");
        }
        return { pointerId, digest };
    }

    async updateForm(pointerId: string, newBlobId: string): Promise<{ digest: string }> {
        this.requireDeployed();
        const keypair = this.requireSigner();
        const tx = new Transaction();
        tx.moveCall({
            target: `${this.packageId}::form_pointer::update`,
            arguments: [
                tx.object(pointerId),
                tx.pure.vector("u8", blobIdToBytes(newBlobId)),
                tx.object(CLOCK_ID),
            ],
        });
        return this.signAndExecute(tx, keypair);
    }

    async recordSubmission(
        pointerId: string,
        submissionBlobId: string,
    ): Promise<{ digest: string }> {
        this.requireDeployed();
        const keypair = this.requireSigner();
        const tx = new Transaction();
        tx.moveCall({
            target: `${this.packageId}::submission_ref::record`,
            arguments: [
                tx.object(pointerId),
                tx.pure.vector("u8", blobIdToBytes(submissionBlobId)),
                tx.object(CLOCK_ID),
            ],
        });
        return this.signAndExecute(tx, keypair);
    }

    // ── Read API ────────────────────────────────

    async getFormPointer(pointerId: string): Promise<FormPointerSummary | null> {
        if (!this.deployed) return null;
        try {
            const obj = await this.client.getObject({
                id: pointerId,
                options: { showContent: true, showType: true },
            });
            const content = obj.data?.content;
            if (!content || content.dataType !== "moveObject") return null;
            if (!content.type.endsWith("::form_pointer::FormPointer")) return null;
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

    async listFormsForOwner(owner: string): Promise<FormPointerSummary[]> {
        if (!this.deployed) return [];
        try {
            const events = await this.client.queryEvents({
                query: {
                    MoveEventType: `${this.packageId}::form_pointer::FormPublished`,
                },
                order: "descending",
                limit: 200,
            });
            const byPointer = new Map<string, FormPointerSummary>();
            for (const ev of events.data) {
                if (ev.sender !== owner) continue;
                const f = ev.parsedJson as FormPublishedFields | undefined;
                if (!f?.pointer_id) continue;
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
            const updates = await this.client.queryEvents({
                query: {
                    MoveEventType: `${this.packageId}::form_pointer::FormUpdated`,
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

    async listSubmissions(pointerId: string, limit = 200): Promise<SubmissionEvent[]> {
        if (!this.deployed) return [];
        try {
            const events = await this.client.queryEvents({
                query: {
                    MoveEventType: `${this.packageId}::submission_ref::SubmissionRecorded`,
                },
                order: "descending",
                limit,
            });
            const out: SubmissionEvent[] = [];
            const seen = new Set<string>();
            for (const ev of events.data) {
                const f = ev.parsedJson as SubmissionRecordedFields | undefined;
                if (!f?.form_pointer_id || f.form_pointer_id !== pointerId) continue;
                if (seen.has(f.submission_id)) continue;
                seen.add(f.submission_id);
                out.push({
                    submissionId: f.submission_id,
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

    async getPolicy(policyId: string): Promise<FormPolicySummary | null> {
        if (!this.deployed) return null;
        try {
            const obj = await this.client.getObject({
                id: policyId,
                options: { showContent: true, showType: true },
            });
            const content = obj.data?.content;
            if (!content || content.dataType !== "moveObject") return null;
            if (!content.type.endsWith("::seal_policy::FormPolicy")) return null;
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

    // ── Internals ────────────────────────────────

    private async signAndExecute(
        tx: Transaction,
        keypair: Ed25519Keypair,
    ): Promise<{ digest: string }> {
        const sender = keypair.toSuiAddress();
        tx.setSender(sender);
        const bytes = await tx.build({ client: this.client });
        const { signature } = await keypair.signTransaction(bytes);
        const res = await this.client.executeTransactionBlock({
            transactionBlock: bytes,
            signature,
            options: { showEffects: true },
        });
        const status = res.effects?.status?.status;
        if (status !== "success") {
            throw new Error(
                `Transaction failed: ${res.effects?.status?.error ?? "unknown error"}`,
            );
        }
        return { digest: res.digest };
    }

    private async findCreatedObject(digest: string, suffix: string): Promise<string | null> {
        await this.client.waitForTransaction({ digest });
        const tx = await this.client.getTransactionBlock({
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
}

// ── Helpers ─────────────────────────────────────

function blobIdToBytes(blobId: string): number[] {
    return Array.from(new TextEncoder().encode(blobId));
}

function bytesFieldToString(value: number[] | string | undefined): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    return new TextDecoder().decode(new Uint8Array(value));
}

/**
 * Load an `Ed25519Keypair` from a bech32 `suiprivkey1…` string.
 * Throws if the string isn't a valid Sui private key.
 */
export function loadKeypair(suiPrivateKey: string): Ed25519Keypair {
    const { scheme, secretKey } = decodeSuiPrivateKey(suiPrivateKey);
    if (scheme !== "ED25519") {
        throw new Error(`Unsupported key scheme: ${scheme}. Only ED25519 is supported.`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
}

/** Heuristic: a form id starting with `0x` is a Sui object id (FormPointer). */
export function isPointerId(id: string): boolean {
    return /^0x[0-9a-fA-F]{1,64}$/.test(id);
}
