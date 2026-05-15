"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { Star, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { FormConfig, FormField, SubmissionResponse, WalrusBlobRef } from "@/types";
import { fetchJSON, uploadJSON, uploadFile, MAX_FILE_SIZE_MB, blobUrl } from "@/lib/walrus";
import { encryptForForm } from "@/lib/crypto";
import { encryptToPolicy } from "@/lib/seal";
import { randomUUID } from "@/lib/uuid";
import { addSubmission } from "@/lib/submissionIndex";
import { getFormPointer, isPointerId, recordSubmission } from "@/lib/registry";
import { hasOnchainRegistry } from "@/lib/contracts";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";
import { useScrollsAccount, useScrollsDAppKit } from "@/lib/useScrollsAccount";
import { buildSignedMessage, digestSubmission } from "@/lib/submissionAuth";
import ScrollsLogo from "@/components/brand/ScrollsLogo";
import RichTextEditor from "@/components/form/RichTextEditor";
import ThemeToggle from "@/components/theme/ThemeToggle";
import MouseGlow from "@/components/ui/MouseGlow";
import DotGrid from "@/components/ui/DotGrid";
if (typeof window !== "undefined") {
    setWasmUrl("/dotlottie-player.wasm");
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function FormSkeleton() {
    return (
        <div className="max-w-xl mx-auto px-6 py-12 animate-pulse">
            <div className="h-8 w-2/3 bg-[color:var(--surface-muted)] rounded-2xl mb-4" />
            <div className="h-4 w-full bg-[color:var(--background-subtle)] rounded mb-2" />
            <div className="h-4 w-4/5 bg-[color:var(--background-subtle)] rounded mb-10" />
            {[1, 2, 3].map((i) => (
                <div key={i} className="mb-8 space-y-2">
                    <div className="h-4 w-1/3 bg-[color:var(--surface-muted)] rounded" />
                    <div className="h-12 w-full bg-[color:var(--background-subtle)] rounded-xl" />
                </div>
            ))}
        </div>
    );
}

// ── Field Input Components ─────────────────────────────────────────────────

function FieldInput({
    field,
    value,
    onChange,
}: {
    field: FormField;
    value: SubmissionResponse["value"];
    onChange: (v: SubmissionResponse["value"]) => void;
}) {
    const strValue = (value as string) ?? "";
    const arrValue = (value as string[]) ?? [];

    switch (field.type) {
        case "short_text":
            return (
                <input
                    type="text"
                    value={strValue}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder ?? "Your answer…"}
                    required={field.required}
                    className="w-full px-4 py-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[20px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] text-sm outline-none focus:bg-[color:var(--surface-raised)] focus:border-[color:var(--brand-primary-soft)] transition-all"
                />
            );

        case "rich_text":
            return (
                <RichTextEditor
                    value={strValue}
                    onChange={onChange}
                    placeholder={field.placeholder ?? "Your answer…"}
                    required={field.required}
                />
            );

        case "long_text":
            return (
                <textarea
                    value={strValue}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder ?? "Your answer…"}
                    required={field.required}
                    rows={4}
                    className="w-full px-4 py-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[20px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] text-sm outline-none focus:bg-[color:var(--surface-raised)] focus:border-[color:var(--brand-primary-soft)] transition-all resize-none"
                />
            );

        case "url":
            return (
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">
                        <Icon icon="fluent:link-24-regular" className="w-4 h-4 text-[color:var(--text-muted)]" />
                    </span>
                    <input
                        type="url"
                        value={strValue}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder ?? "https://…"}
                        required={field.required}
                        className="w-full pl-9 pr-4 py-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[20px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-soft)] text-sm outline-none focus:bg-[color:var(--surface-raised)] focus:border-[color:var(--brand-primary-soft)] transition-all"
                    />
                </div>
            );

        case "dropdown":
            return (
                <select
                    value={strValue}
                    onChange={(e) => onChange(e.target.value)}
                    required={field.required}
                    className="w-full px-4 py-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[20px] text-[color:var(--text-primary)] text-sm outline-none focus:bg-[color:var(--surface-raised)] focus:border-[color:var(--brand-primary-soft)] transition-all appearance-none cursor-pointer"
                >
                    <option value="">Select…</option>
                    {field.options?.map((opt) => (
                        <option key={opt.id} value={opt.label}>{opt.label}</option>
                    ))}
                </select>
            );

        case "multi_select": {
            const toggle = (label: string) => {
                const arr = arrValue.includes(label)
                    ? arrValue.filter((x) => x !== label)
                    : [...arrValue, label];
                onChange(arr);
            };
            return (
                <div className="space-y-2">
                    {field.options?.map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggle(opt.label)}
                            className={clsx(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-[20px] border text-sm text-left transition-colors duration-150",
                                arrValue.includes(opt.label)
                                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary-soft)] text-[color:var(--text-primary)]"
                                    : "border-[color:var(--border-default)] bg-[color:var(--background-subtle)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-panel)]"
                            )}
                        >
                            <span
                                className={clsx(
                                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                    arrValue.includes(opt.label)
                                        ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
                                        : "border-[color:var(--text-soft)]"
                                )}
                            >
                                {arrValue.includes(opt.label) && (
                                    <Icon icon="fluent:checkmark-12-filled" className="w-3 h-3 text-white" />
                                )}
                            </span>
                            {opt.label}
                        </button>
                    ))}
                </div>
            );
        }

        case "star_rating": {
            const numValue = (value as number) ?? 0;
            const count = field.maxStars ?? 5;
            return (
                <div className="flex gap-1">
                    {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => onChange(n)}
                            className="transition-transform duration-100 hover:scale-110"
                        >
                            <Star
                                size={24}
                                className={clsx(
                                    "transition-colors duration-100",
                                    n <= numValue
                                        ? "fill-[#a78bfa] stroke-[#a78bfa]"
                                        : "stroke-[color:var(--text-soft)] fill-transparent"
                                )}
                            />
                        </button>
                    ))}
                </div>
            );
        }

        case "confirm_checkbox": {
            const boolValue = (value as boolean) ?? false;
            return (
                <button
                    type="button"
                    onClick={() => onChange(!boolValue)}
                    className="flex items-start gap-3 text-left"
                >
                    <span
                        className={clsx(
                            "mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors duration-150",
                            boolValue
                                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
                                : "border-[color:var(--text-soft)] bg-transparent"
                        )}
                    >
                        {boolValue && (
                            <Icon icon="fluent:checkmark-12-filled" className="w-3 h-3 text-white" />
                        )}
                    </span>
                    <span className="text-sm text-[color:var(--text-secondary)]">
                        {field.placeholder ?? "I agree"}
                    </span>
                </button>
            );
        }

        case "file_upload":
        case "video_upload":
            return <FileUploadField field={field} value={value as WalrusBlobRef | null} onChange={onChange} />;
    }
}

// ── File upload (real Walrus upload, with progress + size guard) ───────────

function FileUploadField({
    field,
    value,
    onChange,
}: {
    field: FormField;
    value: WalrusBlobRef | null;
    onChange: (v: WalrusBlobRef | null) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const isVideo = field.type === "video_upload";
    const maxMB = field.maxFileSizeMB ?? MAX_FILE_SIZE_MB;
    const accept = isVideo
        ? "video/*"
        : field.acceptedTypes && field.acceptedTypes.length > 0
            ? field.acceptedTypes.join(",")
            : undefined;

    const handlePick = async (file: File) => {
        setError(null);
        setUploading(true);
        try {
            const ref = await uploadFile(file, maxMB);
            onChange(ref);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
            onChange(null);
        } finally {
            setUploading(false);
        }
    };

    const fileMatchesAccept = (file: File): boolean => {
        if (isVideo) return file.type.startsWith("video/");
        if (!field.acceptedTypes || field.acceptedTypes.length === 0) return true;
        return field.acceptedTypes.some((pattern) => {
            const p = pattern.trim().toLowerCase();
            if (!p) return false;
            if (p.endsWith("/*")) return file.type.toLowerCase().startsWith(p.slice(0, -1));
            if (p.startsWith(".")) return file.name.toLowerCase().endsWith(p);
            return file.type.toLowerCase() === p;
        });
    };

    if (value) {
        const sizeKB = Math.max(1, Math.round(value.sizeBytes / 1024));
        return (
            <div className="flex items-center gap-3 px-4 py-3 rounded-[20px] border border-[color:var(--border-default)] bg-[color:var(--surface-panel)]">
                <Icon
                    icon={isVideo ? "fluent:video-clip-24-filled" : "fluent:document-24-filled"}
                    className="w-5 h-5 text-[color:var(--text-secondary)] shrink-0"
                />
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-[color:var(--text-primary)] truncate">{value.filename ?? "file"}</p>
                    <a
                        href={blobUrl(value.blobId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors font-mono"
                    >
                        {sizeKB.toLocaleString()} KB · {value.blobId.slice(0, 8)}…
                    </a>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        onChange(null);
                        setError(null);
                    }}
                    className="p-1.5 rounded-2xl text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors shrink-0"
                    aria-label="Remove file"
                >
                    <Icon icon="fluent:dismiss-24-regular" className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return (
        <div>
            <label
                onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!uploading) setIsDragOver(true);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    if (uploading) return;
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    if (!fileMatchesAccept(file)) {
                        setError(
                            isVideo
                                ? "Please drop a video file."
                                : `File type not allowed. Accepted: ${field.acceptedTypes?.join(", ") ?? "any"}`,
                        );
                        return;
                    }
                    void handlePick(file);
                }}
                className={clsx(
                    "flex flex-col items-center gap-3 p-8 border border-dashed rounded-2xl transition-colors",
                    uploading
                        ? "border-[#a78bfa]/40 bg-[color:var(--brand-primary-soft)] cursor-wait"
                        : isDragOver
                            ? "border-[#a78bfa] bg-[color:var(--brand-primary-soft)]/40 cursor-copy"
                            : "border-[color:var(--border-default)] hover:border-[color:var(--border-strong)] cursor-pointer",
                )}
            >
                {uploading ? (
                    <Loader2 className="w-7 h-7 text-[#a78bfa] animate-spin" />
                ) : (
                    <Icon
                        icon={isVideo ? "fluent:video-clip-24-regular" : "fluent:document-arrow-up-24-regular"}
                        className="w-8 h-8 text-[color:var(--text-soft)]"
                    />
                )}
                <p className="text-sm text-[color:var(--text-secondary)]">
                    {uploading ? (
                        "Uploading to Walrus…"
                    ) : (
                        <>Drop or <span className="text-[#a78bfa]">browse</span></>
                    )}
                </p>
                <p className="text-[10px] text-[color:var(--text-soft)]">Max {maxMB} MB</p>
                <input
                    type="file"
                    className="sr-only"
                    accept={accept}
                    disabled={uploading}
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePick(f);
                        e.target.value = "";
                    }}
                />
            </label>
            {error && (
                <p className="mt-2 text-xs text-[color:var(--status-danger)] flex items-center gap-1.5">
                    <Icon icon="fluent:warning-24-regular" className="w-3.5 h-3.5" />
                    {error}
                </p>
            )}
        </div>
    );
}

// ── Required-field validation (covers types HTML5 `required` can’t) ───────

function missingRequired(field: FormField, value: SubmissionResponse["value"]): boolean {
    if (!field.required) return false;
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "number") return value <= 0;
    if (typeof value === "boolean") return value === false;
    // WalrusBlobRef is always considered filled when present
    return false;
}

// ── Inner component (uses useSearchParams hook) ───────────────────────────

type LoadState = "loading" | "error" | "ready" | "submitting" | "submitted";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new Error(`${label} took too long. Please try again.`));
        }, ms);

        promise.then(
            (value) => {
                window.clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timer);
                reject(error);
            },
        );
    });
}

function FormContent() {
    const [formId, setFormId] = useState("");
    const [searchReady, setSearchReady] = useState(false);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [responses, setResponses] = useState<Map<string, SubmissionResponse["value"]>>(new Map());
    const [receiptBlobId, setReceiptBlobId] = useState<string | null>(null);
    const [receiptCopied, setReceiptCopied] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setFormId(params.get("id") ?? "");
        setSearchReady(true);
    }, []);

    useEffect(() => {
        if (!searchReady) return;
        if (!formId) {
            setErrorMsg("No form ID in URL. Make sure you have ?id=<formId> in the URL.");
            setLoadState("error");
            return;
        }
        async function loadForm() {
            setLoadState("loading");
            try {
                // The URL `id` may be either a Walrus blob id (legacy /
                // anonymous publish) or a Sui object id pointing to a
                // shared `FormPointer` (on-chain registered form). For
                // pointers we resolve to the current blob first so the
                // form follows owner edits without breaking links.
                let blobToFetch = formId;
                let resolvedPointerId: string | undefined;
                if (isPointerId(formId)) {
                    const ptr = await withTimeout(
                        getFormPointer(formId),
                        8000,
                        "Form pointer lookup",
                    );
                    if (ptr) {
                        blobToFetch = ptr.blobId;
                        resolvedPointerId = ptr.pointerId;
                    }
                }
                const config = await withTimeout(
                    fetchJSON<FormConfig>(blobToFetch),
                    12000,
                    "Walrus form fetch",
                );
                if (resolvedPointerId && !config.pointerId) {
                    config.pointerId = resolvedPointerId;
                }
                setFormConfig(config);
                setLoadState("ready");
            } catch (err) {
                setErrorMsg(
                    err instanceof Error
                        ? err.message
                        : "Could not load form. The link may be invalid or the blob no longer hosted.",
                );
                setLoadState("error");
            }
        }
        void loadForm();
    }, [formId, searchReady]);

    const setResponse = (fieldId: string, value: SubmissionResponse["value"]) => {
        setResponses((prev) => new Map(prev).set(fieldId, value));
    };

    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();
    const [signWithWallet, setSignWithWallet] = useState(true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formConfig || !formId) return;
        setSubmitError(null);

        // Validate required fields the browser can’t check natively
        const firstMissing = formConfig.fields.find((f) =>
            missingRequired(f, responses.get(f.id) ?? null),
        );
        if (firstMissing) {
            setSubmitError(`“${firstMissing.label}” is required.`);
            return;
        }

        setLoadState("submitting");

        try {
            const submission: {
                id: string;
                formId: string;
                responses: { fieldId: string; value: SubmissionResponse["value"] }[];
                submittedAt: string;
                submitterAddress?: string;
                signature?: { digest: string; signature: string; address: string };
            } = {
                id: randomUUID(),
                formId,
                responses: formConfig.fields.map((f) => ({
                    fieldId: f.id,
                    value: responses.get(f.id) ?? null,
                })),
                submittedAt: new Date().toISOString(),
                submitterAddress: account?.address,
            };

            // Optional wallet attestation: hash the canonical body, ask
            // the wallet to sign the digest, attach the signature. If
            // the user declines, we silently fall back to an unsigned
            // submission rather than blocking them.
            if (account?.address && dAppKit && signWithWallet) {
                try {
                    const canonical = JSON.stringify(submission);
                    const digest = await digestSubmission(canonical);
                    const message = buildSignedMessage(formId, digest);
                    const signed = await dAppKit.signPersonalMessage({ message });
                    submission.signature = {
                        digest,
                        signature: signed.signature,
                        address: account.address,
                    };
                } catch {
                    // wallet rejected / unsupported — submit unsigned
                }
            }

            // For private forms encrypt the submission JSON before
            // upload. Two envelopes coexist:
            //   v2 (Seal): formConfig.policyId set — threshold encrypt
            //              to an on-chain FormPolicy. Owner + admins
            //              listed there can decrypt.
            //   v1 (ECIES): formConfig.encryptionPublicKey set — legacy
            //              path for forms published before Seal.
            // Public forms send the raw submission JSON (no envelope).
            let payload: unknown = submission;
            if (formConfig.policyId) {
                payload = await encryptToPolicy(
                    formConfig.policyId,
                    JSON.stringify(submission),
                );
            } else if (formConfig.encryptionPublicKey) {
                payload = await encryptForForm(
                    JSON.stringify(submission),
                    formConfig.encryptionPublicKey,
                );
            }

            const blobId = await uploadJSON(payload);
            // Index locally so the form owner sees it on their dashboard
            // immediately when they submit from the same browser.
            addSubmission(formId, {
                submissionBlobId: blobId,
                submittedAt: submission.submittedAt,
                submitterAddress: submission.submitterAddress ?? null,
                isEncrypted: !!(formConfig.policyId || formConfig.encryptionPublicKey),
                isSigned: !!submission.signature,
            });

            // Best-effort: anchor the submission on chain so the owner
            // can discover it from any device. We never block the user
            // on this — the receipt blob is already permanent on Walrus.
            if (
                formConfig.pointerId &&
                account?.address &&
                dAppKit &&
                hasOnchainRegistry()
            ) {
                try {
                    await recordSubmission(dAppKit, formConfig.pointerId, blobId);
                } catch (recErr) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[PublicFormPage] recordSubmission failed:", recErr);
                    }
                }
            }

            setReceiptBlobId(blobId);
            setLoadState("submitted");
        } catch (err) {
            // Stay on the form so the user can retry without losing input
            setSubmitError(
                err instanceof Error
                    ? `Submission failed: ${err.message}`
                    : "Submission failed. Please try again.",
            );
            setLoadState("ready");
        }
    };

    if (loadState === "loading") return <FormSkeleton />;

    if (loadState === "error") {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-[color:var(--status-danger-soft)] border border-[color:var(--status-danger-soft)] flex items-center justify-center mb-4">
                    <Icon icon="fluent:dismiss-circle-24-regular" className="w-7 h-7 text-[color:var(--status-danger)]" />
                </div>
                <p className="text-[color:var(--text-primary)] font-semibold mb-2">Could not load form</p>
                <p className="text-sm text-[color:var(--text-secondary)] max-w-xs">{errorMsg}</p>
            </div>
        );
    }

    if (loadState === "submitted") {
        const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ?? "";
        const receiptUrl = receiptBlobId ? `${aggregator}/v1/blobs/${receiptBlobId}` : "";
        const truncated = receiptBlobId
            ? `${receiptBlobId.slice(0, 8)}…${receiptBlobId.slice(-6)}`
            : "";
        const onCopy = async () => {
            if (!receiptBlobId) return;
            try {
                await navigator.clipboard.writeText(receiptBlobId);
                setReceiptCopied(true);
                setTimeout(() => setReceiptCopied(false), 1600);
            } catch {
                /* clipboard blocked — quietly ignore */
            }
        };
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
                    className="flex flex-col items-center gap-5 max-w-sm"
                >
                    <div className="w-32 h-32 flex items-center justify-center">
                        <DotLottieReact
                            src="/high-five.lottie"
                            autoplay
                            loop={false}
                            className="w-full h-full"
                        />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-display font-bold text-[color:var(--text-primary)]">Thank you</h1>
                        <p className="text-[color:var(--text-secondary)] text-sm">
                            {formConfig?.settings.confirmationMessage ??
                                "Your response is stored permanently on Walrus."}
                        </p>
                    </div>

                    {receiptBlobId && (
                        <div className="w-full mt-2 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] p-4 text-left">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">
                                <Icon icon="fluent:receipt-24-regular" className="w-3 h-3" />
                                Walrus receipt
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <code className="text-xs font-mono text-[color:var(--text-primary)] truncate">{truncated}</code>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={onCopy}
                                        className="p-1.5 rounded-2xl text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors"
                                        aria-label="Copy receipt"
                                    >
                                        <Icon
                                            icon={receiptCopied ? "fluent:checkmark-12-regular" : "fluent:copy-24-regular"}
                                            className="w-3.5 h-3.5"
                                        />
                                    </button>
                                    <a
                                        href={receiptUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-2xl text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--background-subtle)] transition-colors"
                                        aria-label="Open on Walrus"
                                    >
                                        <Icon icon="fluent:open-24-regular" className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            </div>
                            <p className="text-[10px] text-[color:var(--text-soft)] mt-2">
                                Save this ID :—) it&apos;s the permanent address of your response.
                            </p>
                        </div>
                    )}

                    <p className="text-xs text-[color:var(--text-soft)] mt-1">Powered by Scrolls · Walrus</p>
                </motion.div>
            </div>
        );
    }

    if (!formConfig) return null;

    return (
        <div className="max-w-xl mx-auto px-6 py-14 relative z-10">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
                className="mb-12"
            >
                <div className="mb-7 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <ScrollsLogo decorative className="h-7 w-7" />
                        <span className="font-display font-semibold text-sm text-[color:var(--text-primary)] tracking-tight">Scrolls</span>
                        {formConfig.settings.isPrivate && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-[#06b6d4] bg-[#06b6d4]/10 border border-[#06b6d4]/25 rounded-2xl uppercase tracking-wider">
                                <Icon icon="fluent:lock-closed-12-regular" className="w-3 h-3" />
                                Encrypted
                            </span>
                        )}
                    </div>
                    <ThemeToggle />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold text-[color:var(--text-primary)] mb-3 tracking-tight leading-[1.1]">
                    {formConfig.title}
                </h1>
                {formConfig.description && (
                    <p className="text-[color:var(--text-secondary)] text-sm leading-relaxed">
                        {formConfig.description}
                    </p>
                )}
            </motion.div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-8">
                {formConfig.fields.map((field, i) => (
                    <motion.div
                        key={field.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.05, ease: [0.25, 0.4, 0.25, 1] }}
                        className="space-y-2"
                    >
                        <label className="block text-sm font-medium text-[color:var(--text-primary)]">
                            {field.label}
                            {field.required && (
                                <span className="ml-1 text-[#a78bfa]" aria-hidden="true">*</span>
                            )}
                        </label>
                        <FieldInput
                            field={field}
                            value={responses.get(field.id) ?? null}
                            onChange={(v) => setResponse(field.id, v)}
                        />
                    </motion.div>
                ))}

                {/* Submit */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: formConfig.fields.length * 0.05 + 0.2 }}
                    className="pt-4 border-t border-[color:var(--border-subtle)]"
                >
                    {submitError && (
                        <div className="mb-4 px-3 py-2.5 rounded-2xl border border-[color:var(--status-danger-soft)] bg-[color:var(--status-danger-soft)] flex items-start gap-2">
                            <Icon icon="fluent:warning-24-regular" className="w-4 h-4 text-[color:var(--status-danger)] mt-0.5 shrink-0" />
                            <p className="text-xs text-[color:var(--status-danger-text)]">{submitError}</p>
                        </div>
                    )}
                    {account?.address && (
                        <label className="mb-4 flex items-start gap-2 text-xs text-[color:var(--text-secondary)] select-none cursor-pointer">
                            <input
                                type="checkbox"
                                checked={signWithWallet}
                                onChange={(e) => setSignWithWallet(e.target.checked)}
                                className="mt-0.5 accent-[#a78bfa]"
                            />
                            <span>
                                Sign with my wallet to prove this came from{" "}
                                <span className="font-mono text-[color:var(--text-primary)]">
                                    {account.address.slice(0, 6)}…{account.address.slice(-4)}
                                </span>
                                . Walrus will store the signature alongside the response so the form owner can verify it.
                            </span>
                        </label>
                    )}
                    <motion.button
                        type="submit"
                        disabled={loadState === "submitting"}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-2 px-8 py-3 bg-[color:var(--brand-primary)] text-[color:var(--text-inverse)] font-semibold rounded-[18px] hover:bg-[color:var(--brand-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 text-sm"
                    >
                        {loadState === "submitting" ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Submitting…
                            </>
                        ) : (
                            <>
                                Submit response
                                <Icon icon="fluent:arrow-right-24-regular" className="w-4 h-4" />
                            </>
                        )}
                    </motion.button>
                    <p className="text-xs text-[color:var(--text-muted)] mt-4 flex items-center gap-1.5">
                        <Icon icon="fluent:database-24-regular" className="w-3.5 h-3.5 text-[color:var(--text-soft)]" />
                        Stored permanently on Walrus
                        {formConfig.settings.isPrivate && (
                            <>
                                <span className="text-[color:var(--text-muted)]">·</span>
                                <span className="text-[#06b6d4]">End-to-end encrypted</span>
                            </>
                        )}
                    </p>
                </motion.div>
            </form>
        </div>
    );
}

// ── Public export ──────────────────────────────────────────────────────────

export default function PublicFormPage() {
    return (
        <div className="relative min-h-screen bg-[color:var(--background-app)] overflow-hidden">
            <DotGrid />
            <MouseGlow intensity="subtle" />
            <FormContent />
        </div>
    );
}
