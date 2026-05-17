import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

type FieldType = "short_text" | "long_text" | "rich_text" | "dropdown" | "multi_select" | "star_rating" | "file_upload" | "video_upload" | "url" | "confirm_checkbox";
interface FieldOption {
    id: string;
    label: string;
}
interface FormField {
    id: string;
    type: FieldType;
    label: string;
    placeholder?: string;
    required: boolean;
    options?: FieldOption[];
    maxStars?: number;
    maxFileSizeMB?: number;
    acceptedTypes?: string[];
}
interface FormSettings {
    isPrivate: boolean;
    allowAnonymous: boolean;
    maxResponses?: number;
    closesAt?: string;
    redirectUrl?: string;
    confirmationMessage?: string;
}
interface FormConfig {
    id: string;
    title: string;
    description?: string;
    fields: FormField[];
    settings: FormSettings;
    createdAt: string;
    updatedAt: string;
    ownerAddress: string;
    walrusBlobId?: string;
    pointerId?: string;
    encryptionPublicKey?: JsonWebKey;
    policyId?: string;
}
interface WalrusBlobRef {
    blobId: string;
    mimeType: string;
    sizeBytes: number;
    filename?: string;
}
interface SubmissionResponse {
    fieldId: string;
    value: string | string[] | number | boolean | WalrusBlobRef | null;
}
interface Submission {
    id: string;
    formId: string;
    responses: SubmissionResponse[];
    submittedAt: string;
    submitterAddress?: string;
    walrusBlobId?: string;
}
type ScrollsNetwork = "testnet" | "mainnet" | "devnet";
interface NetworkConfig {
    network: ScrollsNetwork;
    walrusPublisher: string;
    walrusAggregator: string;
    walrusEpochs: number;
    suiRpc: string;
    /** Move package id holding `form_pointer`, `submission_ref`, `seal_policy`. Empty string disables on-chain registry. */
    scrollsPackage: string;
    /** Optional Sui ed25519 private key (bech32 `suiprivkey1…`) used to sign on-chain txs. */
    suiPrivateKey?: string;
    /** Base URL where the Scrolls web app is hosted (used to compose share URLs). */
    appUrl: string;
}
/**
 * Human-friendly form spec accepted by `parseFormSpec()`. All fields
 * except `title` and `fields` are optional and will be filled with
 * sensible defaults.
 */
interface FormSpec {
    title: string;
    description?: string;
    settings?: Partial<FormSettings>;
    fields: FormFieldSpec[];
}
interface FormFieldSpec {
    type: FieldType;
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: Array<string | FieldOption>;
    maxStars?: number;
    maxFileSizeMB?: number;
    acceptedTypes?: string[];
}

interface RegistryConfig {
    network: ScrollsNetwork;
    rpcUrl: string;
    packageId: string;
    /** Optional bech32-encoded private key (`suiprivkey1…`). */
    privateKey?: string;
}
interface FormPointerSummary {
    pointerId: string;
    owner: string;
    blobId: string;
    version: number;
    createdAtMs: number;
    updatedAtMs: number;
}
interface SubmissionEvent {
    submissionId: string;
    pointerId: string;
    blobId: string;
    submitter: string;
    submittedAtMs: number;
}
interface FormPolicySummary {
    policyId: string;
    owner: string;
    admins: string[];
}
declare class Registry {
    readonly client: SuiJsonRpcClient;
    readonly packageId: string;
    readonly network: ScrollsNetwork;
    private readonly keypair?;
    constructor(cfg: RegistryConfig);
    /** Is the Move package configured on this network? */
    get deployed(): boolean;
    /** Public Sui address derived from the signer, if any. */
    address(): string | null;
    private requireSigner;
    private requireDeployed;
    publishForm(blobId: string): Promise<{
        pointerId: string;
        digest: string;
    }>;
    updateForm(pointerId: string, newBlobId: string): Promise<{
        digest: string;
    }>;
    recordSubmission(pointerId: string, submissionBlobId: string): Promise<{
        digest: string;
    }>;
    getFormPointer(pointerId: string): Promise<FormPointerSummary | null>;
    listFormsForOwner(owner: string): Promise<FormPointerSummary[]>;
    listSubmissions(pointerId: string, limit?: number): Promise<SubmissionEvent[]>;
    getPolicy(policyId: string): Promise<FormPolicySummary | null>;
    private signAndExecute;
    private findCreatedObject;
}
/**
 * Load an `Ed25519Keypair` from a bech32 `suiprivkey1…` string.
 * Throws if the string isn't a valid Sui private key.
 */
declare function loadKeypair(suiPrivateKey: string): Ed25519Keypair;
/** Heuristic: a form id starting with `0x` is a Sui object id (FormPointer). */
declare function isPointerId(id: string): boolean;

interface EncryptedEnvelope {
    v: number;
    alg: string;
    ephemeralPub: string;
    iv: string;
    ciphertext: string;
}
interface FormKeypair {
    publicKeyJwk: JsonWebKey;
    privateKeyJwk: JsonWebKey;
}
declare function generateFormKeypair(): Promise<FormKeypair>;
declare function encryptForForm(plaintext: string, formPublicKeyJwk: JsonWebKey): Promise<EncryptedEnvelope>;
declare function decryptForForm(envelope: EncryptedEnvelope, privateKeyJwk: JsonWebKey): Promise<string>;
declare function isEncryptedEnvelope(x: unknown): x is EncryptedEnvelope;

interface ScrollsClientOptions extends Partial<NetworkConfig> {
    network?: ScrollsNetwork;
}
interface CreateFormResult {
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
interface SubmitResult {
    submissionId: string;
    blobId: string;
    txDigest?: string;
}
interface DecryptedSubmission extends Submission {
    /** Sui object id of the SubmissionRef receipt, when on-chain registry is enabled. */
    submissionRefId?: string;
    /** True if the blob was encrypted and was successfully decrypted. */
    wasEncrypted: boolean;
}
declare class ScrollsClient {
    readonly config: NetworkConfig;
    readonly registry: Registry;
    constructor(options?: ScrollsClientOptions);
    private get walrus();
    /** Sui address derived from the configured signer, or `null`. */
    address(): string | null;
    /**
     * Build, upload and (optionally) register a new form.
     *
     * Accepts a `FormSpec` (the human-friendly shape) or a raw spec
     * string in YAML or JSON. Returns the canonical `formId` — which
     * is the Sui `pointerId` when on-chain registry is available, or
     * the Walrus `blobId` otherwise.
     */
    createForm(input: FormSpec | string | FormConfig, opts?: {
        ownerAddress?: string;
    }): Promise<CreateFormResult>;
    private buildFormConfig;
    /**
     * Fetch the latest form config for a given id (FormPointer object
     * id or Walrus blob id). When given a pointer id, the current
     * blob is resolved on-chain first.
     */
    getForm(formId: string): Promise<FormConfig>;
    private resolveBlobId;
    /** List all forms published by the given address (on-chain only). */
    listForms(address?: string): Promise<FormPointerSummary[]>;
    /**
     * Build and upload a submission. If the form is private and has an
     * `encryptionPublicKey`, the submission JSON is wrapped in an
     * ECIES envelope before upload.
     *
     * When the on-chain registry is configured, a `SubmissionRecorded`
     * event is also emitted so the form owner can see the response
     * cross-device.
     */
    submit(formId: string, responses: SubmissionResponse[], opts?: {
        submitterAddress?: string;
    }): Promise<SubmitResult>;
    /**
     * Fetch all submissions recorded on-chain for a form, optionally
     * decrypting them with the provided private key (JWK).
     *
     * Only available when the form id is a Sui pointer id and the
     * registry is configured — anonymous/local forms have no
     * cross-device index.
     */
    listSubmissions(formId: string, opts?: {
        privateKeyJwk?: JsonWebKey;
        limit?: number;
    }): Promise<DecryptedSubmission[]>;
    /**
     * Convenience: dump submissions as CSV.
     * Columns: timestamp, submitter, then one column per field id.
     */
    exportCsv(formId: string, opts?: {
        privateKeyJwk?: JsonWebKey;
    }): Promise<string>;
    shareUrl(formId: string): string;
    responsesUrl(formId: string): string;
}

/**
 * Parse a string containing JSON or YAML into a typed `FormSpec`.
 * Detects format from the first non-whitespace character: `{` or `[`
 * means JSON, anything else is treated as YAML.
 */
declare function parseSpecString(input: string): FormSpec;
/**
 * Validate an arbitrary object as a `FormSpec`. Throws a descriptive
 * `Error` on the first violation rather than collecting them all — the
 * CLI surfaces the message as-is.
 */
declare function assertFormSpec(value: unknown): FormSpec;
/**
 * Materialise a `FormSpec` into the on-the-wire `FormConfig` that the
 * web app expects to find on Walrus. The result is pure data — call
 * `walrus.uploadJSON()` to publish.
 */
declare function specToFormConfig(spec: FormSpec, ownerAddress: string): FormConfig;

interface WalrusEndpoints {
    publisher: string;
    aggregator: string;
    epochs: number;
}
/**
 * Upload raw bytes to a Walrus publisher. Stores the blob as permanent
 * (non-deletable) which matches Scrolls' "permanent record" semantics.
 */
declare function uploadBlob(endpoints: WalrusEndpoints, data: Uint8Array, mimeType: string): Promise<string>;
declare function uploadJSON(endpoints: WalrusEndpoints, data: unknown): Promise<string>;
declare function fetchBlob(endpoints: WalrusEndpoints, blobId: string): Promise<Uint8Array>;
declare function fetchJSON<T>(endpoints: WalrusEndpoints, blobId: string): Promise<T>;
declare function blobUrl(endpoints: WalrusEndpoints, blobId: string): string;

declare const DEFAULT_PUBLISHERS: Record<ScrollsNetwork, string>;
declare const DEFAULT_AGGREGATORS: Record<ScrollsNetwork, string>;
declare const DEFAULT_SUI_RPC: Record<ScrollsNetwork, string>;
declare const DEFAULT_PACKAGES: Record<ScrollsNetwork, string>;
declare const DEFAULT_APP_URLS: Record<ScrollsNetwork, string>;
declare const DEFAULT_EPOCHS = 53;
declare function resolveNetworkConfig(network: ScrollsNetwork, overrides?: Partial<NetworkConfig>): NetworkConfig;

export { type CreateFormResult, DEFAULT_AGGREGATORS, DEFAULT_APP_URLS, DEFAULT_EPOCHS, DEFAULT_PACKAGES, DEFAULT_PUBLISHERS, DEFAULT_SUI_RPC, type DecryptedSubmission, type EncryptedEnvelope, type FieldOption, type FieldType, type FormConfig, type FormField, type FormFieldSpec, type FormKeypair, type FormPointerSummary, type FormPolicySummary, type FormSettings, type FormSpec, type NetworkConfig, Registry, type RegistryConfig, ScrollsClient, type ScrollsClientOptions, type ScrollsNetwork, type Submission, type SubmissionEvent, type SubmissionResponse, type SubmitResult, type WalrusBlobRef, type WalrusEndpoints, assertFormSpec, blobUrl, decryptForForm, encryptForForm, fetchBlob, fetchJSON, generateFormKeypair, isEncryptedEnvelope, isPointerId, loadKeypair, parseSpecString, resolveNetworkConfig, specToFormConfig, uploadBlob, uploadJSON };
