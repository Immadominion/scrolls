// ─────────────────────────────────────────────────
// ScrollsClient — the main entry point
//
// Wraps Walrus + Sui + ECIES into a small API:
//
//   const scrolls = new ScrollsClient({
//     network: "testnet",
//     suiPrivateKey: process.env.SUI_PRIVATE_KEY,
//   });
//
//   const { formId, shareUrl } = await scrolls.createForm({ ... });
//
// All methods are async and never throw on missing optional config —
// they throw with an actionable message that points at the specific
// thing the caller needs to set.
// ─────────────────────────────────────────────────

import {
    DEFAULT_EPOCHS,
} from "./network.js";
import { resolveNetworkConfig } from "./network.js";
import {
    fetchJSON,
    uploadJSON,
    type WalrusEndpoints,
} from "./walrus.js";
import {
    Registry,
    isPointerId,
    type FormPointerSummary,
    type SubmissionEvent,
} from "./registry.js";
import {
    encryptForForm,
    decryptForForm,
    generateFormKeypair,
    isEncryptedEnvelope,
    type EncryptedEnvelope,
    type FormKeypair,
} from "./crypto.js";
import {
    parseSpecString,
    specToFormConfig,
    assertFormSpec,
} from "./schema.js";
import type {
    FormConfig,
    FormSpec,
    NetworkConfig,
    ScrollsNetwork,
    Submission,
    SubmissionResponse,
} from "./types.js";

export interface ScrollsClientOptions extends Partial<NetworkConfig> {
    network?: ScrollsNetwork;
}

export interface CreateFormResult {
    formId: string;
    blobId: string;
    pointerId?: string;
    txDigest?: string;
    shareUrl: string;
    /**
     * If the form was created as private, this is the freshly-generated
     * keypair. The caller MUST persist `privateKeyJwk` — without it,
     * encrypted responses cannot be decrypted. The SDK does not store
     * it anywhere.
     */
    decryptionKey?: FormKeypair;
}

export interface SubmitResult {
    submissionId: string;
    blobId: string;
    txDigest?: string;
}

export interface DecryptedSubmission extends Submission {
    /** Sui object id of the SubmissionRef receipt, when on-chain registry is enabled. */
    submissionRefId?: string;
    /** True if the blob was encrypted and was successfully decrypted. */
    wasEncrypted: boolean;
}

export class ScrollsClient {
    readonly config: NetworkConfig;
    readonly registry: Registry;

    constructor(options: ScrollsClientOptions = {}) {
        const network = options.network ?? "testnet";
        this.config = resolveNetworkConfig(network, options);
        this.registry = new Registry({
            network: this.config.network,
            rpcUrl: this.config.suiRpc,
            packageId: this.config.scrollsPackage,
            privateKey: this.config.suiPrivateKey,
        });
    }

    private get walrus(): WalrusEndpoints {
        return {
            publisher: this.config.walrusPublisher,
            aggregator: this.config.walrusAggregator,
            epochs: this.config.walrusEpochs ?? DEFAULT_EPOCHS,
        };
    }

    /** Sui address derived from the configured signer, or `null`. */
    address(): string | null {
        return this.registry.address();
    }

    // ── Create ──────────────────────────────────

    /**
     * Build, upload and (optionally) register a new form.
     *
     * Accepts a `FormSpec` (the human-friendly shape) or a raw spec
     * string in YAML or JSON. Returns the canonical `formId` — which
     * is the Sui `pointerId` when on-chain registry is available, or
     * the Walrus `blobId` otherwise.
     */
    async createForm(
        input: FormSpec | string | FormConfig,
        opts: { ownerAddress?: string } = {},
    ): Promise<CreateFormResult> {
        const owner =
            opts.ownerAddress ??
            this.registry.address() ??
            "0x0";

        const config = this.buildFormConfig(input, owner);

        let decryptionKey: FormKeypair | undefined;
        if (config.settings.isPrivate && !config.encryptionPublicKey) {
            decryptionKey = await generateFormKeypair();
            config.encryptionPublicKey = decryptionKey.publicKeyJwk;
        }

        const blobId = await uploadJSON(this.walrus, config);

        let pointerId: string | undefined;
        let txDigest: string | undefined;
        if (this.registry.deployed && this.registry.address()) {
            const result = await this.registry.publishForm(blobId);
            pointerId = result.pointerId;
            txDigest = result.digest;
        }

        const formId = pointerId ?? blobId;
        return {
            formId,
            blobId,
            pointerId,
            txDigest,
            shareUrl: this.shareUrl(formId),
            decryptionKey,
        };
    }

    private buildFormConfig(
        input: FormSpec | string | FormConfig,
        owner: string,
    ): FormConfig {
        if (typeof input === "string") {
            return specToFormConfig(parseSpecString(input), owner);
        }
        // Looks like a FormConfig (already has id + fields)?
        if (
            typeof (input as FormConfig).id === "string" &&
            Array.isArray((input as FormConfig).fields) &&
            (input as FormConfig).settings
        ) {
            return { ...(input as FormConfig) };
        }
        return specToFormConfig(assertFormSpec(input), owner);
    }

    // ── Read ────────────────────────────────────

    /**
     * Fetch the latest form config for a given id (FormPointer object
     * id or Walrus blob id). When given a pointer id, the current
     * blob is resolved on-chain first.
     */
    async getForm(formId: string): Promise<FormConfig> {
        const blobId = await this.resolveBlobId(formId);
        return fetchJSON<FormConfig>(this.walrus, blobId);
    }

    private async resolveBlobId(formId: string): Promise<string> {
        if (!isPointerId(formId)) return formId;
        if (!this.registry.deployed) {
            throw new Error(
                `Form id "${formId}" looks like a Sui object but no Move package is configured for ${this.config.network}.`,
            );
        }
        const summary = await this.registry.getFormPointer(formId);
        if (!summary) {
            throw new Error(`FormPointer ${formId} not found on ${this.config.network}.`);
        }
        return summary.blobId;
    }

    /** List all forms published by the given address (on-chain only). */
    async listForms(address?: string): Promise<FormPointerSummary[]> {
        const owner = address ?? this.registry.address();
        if (!owner) {
            throw new Error("listForms: no address provided and no signer configured.");
        }
        return this.registry.listFormsForOwner(owner);
    }

    // ── Submit ──────────────────────────────────

    /**
     * Build and upload a submission. If the form is private and has an
     * `encryptionPublicKey`, the submission JSON is wrapped in an
     * ECIES envelope before upload.
     *
     * When the on-chain registry is configured, a `SubmissionRecorded`
     * event is also emitted so the form owner can see the response
     * cross-device.
     */
    async submit(
        formId: string,
        responses: SubmissionResponse[],
        opts: { submitterAddress?: string } = {},
    ): Promise<SubmitResult> {
        const form = await this.getForm(formId);
        const submission: Submission = {
            id: crypto.randomUUID(),
            formId,
            responses,
            submittedAt: new Date().toISOString(),
            submitterAddress: opts.submitterAddress ?? this.registry.address() ?? undefined,
        };

        let payload: unknown = submission;
        if (form.settings.isPrivate) {
            if (!form.encryptionPublicKey) {
                throw new Error(
                    "Form is marked private but has no encryptionPublicKey — cannot submit.",
                );
            }
            const envelope = await encryptForForm(
                JSON.stringify(submission),
                form.encryptionPublicKey,
            );
            payload = envelope;
        }

        const blobId = await uploadJSON(this.walrus, payload);

        let txDigest: string | undefined;
        if (this.registry.deployed && this.registry.address() && isPointerId(formId)) {
            const res = await this.registry.recordSubmission(formId, blobId);
            txDigest = res.digest;
        }

        return { submissionId: submission.id, blobId, txDigest };
    }

    // ── Submissions read ────────────────────────

    /**
     * Fetch all submissions recorded on-chain for a form, optionally
     * decrypting them with the provided private key (JWK).
     *
     * Only available when the form id is a Sui pointer id and the
     * registry is configured — anonymous/local forms have no
     * cross-device index.
     */
    async listSubmissions(
        formId: string,
        opts: { privateKeyJwk?: JsonWebKey; limit?: number } = {},
    ): Promise<DecryptedSubmission[]> {
        if (!isPointerId(formId)) {
            throw new Error(
                "listSubmissions: form id must be a Sui pointer id (0x…) to enumerate submissions.",
            );
        }
        const events = await this.registry.listSubmissions(formId, opts.limit ?? 200);
        const out: DecryptedSubmission[] = [];

        await Promise.all(
            events.map(async (ev) => {
                try {
                    const blob = await fetchJSON<Submission | EncryptedEnvelope>(
                        this.walrus,
                        ev.blobId,
                    );
                    if (isEncryptedEnvelope(blob)) {
                        if (!opts.privateKeyJwk) {
                            // Skip — caller has no key. Surface a stub so they know it exists.
                            out.push({
                                id: ev.submissionId,
                                formId,
                                responses: [],
                                submittedAt: new Date(ev.submittedAtMs).toISOString(),
                                submitterAddress: ev.submitter,
                                walrusBlobId: ev.blobId,
                                submissionRefId: ev.submissionId,
                                wasEncrypted: true,
                            });
                            return;
                        }
                        const plaintext = await decryptForForm(blob, opts.privateKeyJwk);
                        const sub = JSON.parse(plaintext) as Submission;
                        out.push({
                            ...sub,
                            walrusBlobId: ev.blobId,
                            submissionRefId: ev.submissionId,
                            wasEncrypted: true,
                        });
                    } else {
                        out.push({
                            ...blob,
                            walrusBlobId: ev.blobId,
                            submissionRefId: ev.submissionId,
                            wasEncrypted: false,
                        });
                    }
                } catch {
                    // Drop unreadable blobs silently — the event still proves the
                    // submission happened, but the bytes are unavailable.
                }
            }),
        );

        return out.sort(
            (a, b) =>
                new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
        );
    }

    /**
     * Convenience: dump submissions as CSV.
     * Columns: timestamp, submitter, then one column per field id.
     */
    async exportCsv(
        formId: string,
        opts: { privateKeyJwk?: JsonWebKey } = {},
    ): Promise<string> {
        const form = await this.getForm(formId);
        const subs = await this.listSubmissions(formId, opts);
        const header = [
            "submitted_at",
            "submitter",
            ...form.fields.map((f) => f.label),
        ];
        const rows = subs.map((s) => {
            const cells = [s.submittedAt, s.submitterAddress ?? ""];
            for (const field of form.fields) {
                const r = s.responses.find((x) => x.fieldId === field.id);
                cells.push(csvEscape(stringifyResponse(r?.value ?? null)));
            }
            return cells.join(",");
        });
        return [header.map(csvEscape).join(","), ...rows].join("\n");
    }

    // ── URL helpers ─────────────────────────────

    shareUrl(formId: string): string {
        return `${this.config.appUrl}/f?id=${encodeURIComponent(formId)}`;
    }

    responsesUrl(formId: string): string {
        return `${this.config.appUrl}/responses?id=${encodeURIComponent(formId)}`;
    }
}

// ── helpers ─────────────────────────────────

function stringifyResponse(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.join(" | ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function csvEscape(s: string): string {
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/"/g, "\"\"")}"`;
    }
    return s;
}
