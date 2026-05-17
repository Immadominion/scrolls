// @scrolls/sdk — public API surface

export { ScrollsClient } from "./client.js";
export type {
    ScrollsClientOptions,
    CreateFormResult,
    SubmitResult,
    DecryptedSubmission,
} from "./client.js";

export {
    Registry,
    isPointerId,
    loadKeypair,
} from "./registry.js";
export type {
    RegistryConfig,
    FormPointerSummary,
    SubmissionEvent,
    FormPolicySummary,
} from "./registry.js";

export {
    parseSpecString,
    assertFormSpec,
    specToFormConfig,
} from "./schema.js";

export {
    uploadBlob,
    uploadJSON,
    fetchBlob,
    fetchJSON,
    blobUrl,
} from "./walrus.js";
export type { WalrusEndpoints } from "./walrus.js";

export {
    generateFormKeypair,
    encryptForForm,
    decryptForForm,
    isEncryptedEnvelope,
} from "./crypto.js";
export type { EncryptedEnvelope, FormKeypair } from "./crypto.js";

export {
    DEFAULT_PUBLISHERS,
    DEFAULT_AGGREGATORS,
    DEFAULT_SUI_RPC,
    DEFAULT_PACKAGES,
    DEFAULT_APP_URLS,
    DEFAULT_EPOCHS,
    resolveNetworkConfig,
} from "./network.js";

export type {
    FieldOption,
    FieldType,
    FormConfig,
    FormField,
    FormFieldSpec,
    FormSettings,
    FormSpec,
    NetworkConfig,
    ScrollsNetwork,
    Submission,
    SubmissionResponse,
    WalrusBlobRef,
} from "./types.js";
