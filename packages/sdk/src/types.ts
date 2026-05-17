// ─────────────────────────────────────────────────
// @scrolls/sdk — Public type surface
//
// Mirrors `app/src/types/index.ts` so the SDK can be installed and used
// without depending on the Next.js project. Keep the two in sync when
// adding fields.
// ─────────────────────────────────────────────────

export type FieldType =
    | "short_text"
    | "long_text"
    | "rich_text"
    | "dropdown"
    | "multi_select"
    | "star_rating"
    | "file_upload"
    | "video_upload"
    | "url"
    | "confirm_checkbox";

export interface FieldOption {
    id: string;
    label: string;
}

export interface FormField {
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

export interface FormSettings {
    isPrivate: boolean;
    allowAnonymous: boolean;
    maxResponses?: number;
    closesAt?: string;
    redirectUrl?: string;
    confirmationMessage?: string;
}

export interface FormConfig {
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

export interface WalrusBlobRef {
    blobId: string;
    mimeType: string;
    sizeBytes: number;
    filename?: string;
}

export interface SubmissionResponse {
    fieldId: string;
    value: string | string[] | number | boolean | WalrusBlobRef | null;
}

export interface Submission {
    id: string;
    formId: string;
    responses: SubmissionResponse[];
    submittedAt: string;
    submitterAddress?: string;
    walrusBlobId?: string;
}

// ── Network configuration ──────────────────────────

export type ScrollsNetwork = "testnet" | "mainnet" | "devnet";

export interface NetworkConfig {
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

// ── Convenience aliases for the spec parser ────────

/**
 * Human-friendly form spec accepted by `parseFormSpec()`. All fields
 * except `title` and `fields` are optional and will be filled with
 * sensible defaults.
 */
export interface FormSpec {
    title: string;
    description?: string;
    settings?: Partial<FormSettings>;
    fields: FormFieldSpec[];
}

export interface FormFieldSpec {
    type: FieldType;
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: Array<string | FieldOption>;
    maxStars?: number;
    maxFileSizeMB?: number;
    acceptedTypes?: string[];
}
