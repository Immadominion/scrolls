// ─────────────────────────────────────────────────
// Scrolls Forms — Core TypeScript Interfaces
// All IDs are strings. No `any` types.
// ─────────────────────────────────────────────────

// ── Field Types ───────────────────────────────────

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
    id: string;             // crypto.randomUUID()
    type: FieldType;
    label: string;
    placeholder?: string;
    required: boolean;
    options?: FieldOption[]; // for dropdown / multi_select
    maxStars?: number;       // for star_rating (default 5)
    maxFileSizeMB?: number;  // for file_upload / video_upload
    acceptedTypes?: string[]; // for file_upload e.g. ["image/*", "application/pdf"]
}

// ── Form Config (stored as Walrus blob) ────────────

export interface FormSettings {
    isPrivate: boolean;          // if true, responses are end-to-end encrypted
    allowAnonymous: boolean;     // if true, respondents don't need a Sui wallet
    maxResponses?: number;       // optional cap
    closesAt?: string;           // ISO timestamp
    redirectUrl?: string;        // after submit
    confirmationMessage?: string;
}

export interface FormConfig {
    id: string;                  // UUID, also used as the URL slug
    title: string;
    description?: string;
    fields: FormField[];
    settings: FormSettings;
    createdAt: string;           // ISO timestamp
    updatedAt: string;
    ownerAddress: string;        // Sui wallet address of form creator
    walrusBlobId?: string;       // set after publishing to Walrus
    suiObjectId?: string;        // set after on-chain registration (Phase 2)
    /**
     * Sui object id of the shared `FormPointer` that pins this form's
     * current Walrus blob. When present, the canonical share URL becomes
     * `/f?id=<pointerId>` and the dashboard discovers the form
     * cross-device by streaming `FormPublished` events. Optional during
     * the testnet→mainnet rollout window when the package may not be
     * deployed on the active network.
     */
    pointerId?: string;
    /**
     * ECDH P-256 public key (JWK) of the form owner.
     * Present when `settings.isPrivate` is true and the form was
     * published *before* Seal integration (envelope v1). For envelope
     * v2 (Seal) `policyId` is set instead.
     * The matching private key never leaves the owner's browser
     * (with a downloadable backup file).
     */
    encryptionPublicKey?: JsonWebKey;
    /**
     * Sui object id (hex, 0x-prefixed) of the shared `FormPolicy`
     * Move object that gates Seal decryption for this form. Present
     * when `settings.isPrivate` is true on a v2 (Seal) form.
     * Owner + admins listed on the policy can decrypt.
     */
    policyId?: string;
}

// ── Submission (stored as Walrus blob) ─────────────

export interface SubmissionResponse {
    fieldId: string;
    value: string | string[] | number | boolean | WalrusBlobRef | null;
}

export interface Submission {
    id: string;                  // UUID
    formId: string;
    responses: SubmissionResponse[];
    submittedAt: string;         // ISO timestamp
    submitterAddress?: string;   // Sui wallet address (if not anonymous)
    /**
     * Optional wallet attestation. Present when the respondent had a
     * connected Sui wallet and chose to sign their submission. Verified
     * on the responses viewer with `verifyPersonalMessageSignature`.
     */
    signature?: {
        digest: string;          // base64url SHA-256 of the canonical body
        signature: string;       // Sui serialised signPersonalMessage output
        address: string;         // claimed signer address
    };
    walrusBlobId?: string;       // set after upload
    suiObjectId?: string;        // set after on-chain registration
    // Admin-only metadata (never stored in the blob)
    adminNotes?: string;
    priority?: "low" | "medium" | "high" | "critical";
    tags?: string[];
}

// ── Walrus Storage ────────────────────────────────

export interface WalrusBlobRef {
    blobId: string;              // base64url-encoded Walrus blob ID
    mimeType: string;
    sizeBytes: number;
    filename?: string;
}

// ── AI Analysis (Claude Haiku via the Cloudflare Worker proxy) ───────

export interface AIAnalysis {
    submissionId: string;
    sentiment: "positive" | "neutral" | "negative";
    sentimentScore: number;      // 0–1
    topics: string[];
    suggestedPriority: "low" | "medium" | "high" | "critical";
    summary: string;
    analyzedAt: string;          // ISO timestamp
}

// ── Sui On-chain Structures ───────────────────────

export interface FormRegistryEntry {
    formId: string;
    walrusBlobId: string;
    ownerAddress: string;
    createdAt: number;           // epoch ms
    submissionCount: number;
}

export interface SubmissionRef {
    submissionId: string;
    formId: string;
    walrusBlobId: string;
    submitterAddress?: string;
    submittedAt: number;         // epoch ms
    isEncrypted: boolean;
}

// ── Dashboard ─────────────────────────────────────

export interface DashboardFilters {
    priority?: Submission["priority"];
    tags?: string[];
    search?: string;
    dateFrom?: string;
    dateTo?: string;
}

export type SortField = "submittedAt" | "priority" | "submitterAddress";
export type SortOrder = "asc" | "desc";
