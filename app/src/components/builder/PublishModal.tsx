"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { X, Loader2, Copy, Check, ExternalLink, Lock, Download, Link as LinkIcon } from "lucide-react";
import clsx from "clsx";
import type { FormConfig } from "@/types";
import ShareCardModal from "@/components/share/ShareCardModal";
import { uploadJSON } from "@/lib/walrus";
import { addForm } from "@/lib/formIndex";
import { removeDraft } from "@/lib/draftIndex";
import { useScrollsAccount, useScrollsDAppKit } from "@/lib/useScrollsAccount";
import { hasOnchainRegistry, hasSeal } from "@/lib/contracts";
import { publishForm, createPolicy } from "@/lib/registry";
import {
    buildKeyBackup,
    removeFormPrivateKey,
    type FormKeypair,
} from "@/lib/crypto";
import { storeHardenedFormPrivateKey } from "@/lib/keyStore";

// ── Step types ─────────────────────────────────────────────────────────────

type Step = "confirm" | "keygen" | "policy" | "uploading" | "registering" | "indexing" | "done" | "error";

interface PublishModalProps {
    formConfig: FormConfig;
    /** Local draft ID to delete from draftIndex after successful publish */
    localDraftId?: string;
    onClose: () => void;
    onPublished: (updated: FormConfig) => void;
    setIsPublishing: (v: boolean) => void;
}

// ── Overlay backdrop ───────────────────────────────────────────────────────

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

const modalVariants = {
    hidden: { opacity: 0, scale: 0.96, y: 8 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 8 },
};

// ── Step: Confirm ──────────────────────────────────────────────────────────

function ConfirmStep({
    formConfig,
    onPublish,
}: {
    formConfig: FormConfig;
    onPublish: () => void;
}) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-display font-bold text-[color:var(--text-primary)] mb-1">
                    Publish form
                </h2>
                <p className="text-sm text-[color:var(--text-secondary)]">
                    Your form will be stored permanently on Walrus and shared via a link.
                </p>
            </div>

            {/* Summary */}
            <div className="space-y-2 p-4 rounded-xl bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)]">
                <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--text-muted)]">Fields</span>
                    <span className="text-[color:var(--text-primary)]">{formConfig.fields.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--text-muted)]">Privacy</span>
                    <span className={formConfig.settings.isPrivate ? "text-[#06b6d4]" : "text-[color:var(--text-primary)]"}>
                        {formConfig.settings.isPrivate ? (
                            <span className="flex items-center gap-1">
                                <Lock size={12} /> End-to-end encrypted
                            </span>
                        ) : (
                            "Public"
                        )}
                    </span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--text-muted)]">Storage</span>
                    <span className="text-[color:var(--text-primary)]">Walrus permanent</span>
                </div>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={onPublish}
                    className="flex-1 py-3 bg-[#a78bfa] text-[#0a0a0a] font-semibold rounded-xl hover:bg-[#c4b5fd] transition-colors text-sm"
                >
                    Publish to Walrus
                </button>
            </div>
        </div>
    );
}

// ── Step: Uploading / Registering ──────────────────────────────────────────

function LoadingStep({ step }: { step: "keygen" | "policy" | "uploading" | "registering" | "indexing" }) {
    const [showSlowHint, setShowSlowHint] = useState(false);
    useEffect(() => {
        if (step !== "uploading") return;
        const t = setTimeout(() => setShowSlowHint(true), 8000);
        return () => clearTimeout(t);
    }, [step]);
    const copy = {
        keygen: {
            title: "Generating decryption key\u2026",
            sub: "Creating an ECDH P-256 keypair in your browser",
        },
        policy: {
            title: "Creating access policy\u2026",
            sub: "Approve in your wallet \u2014 this publishes the Seal policy on Sui",
        },
        uploading: {
            title: "Uploading to Walrus…",
            sub: "Storing your form definition as a permanent blob",
        },
        registering: {
            title: "Registering on Sui…",
            sub: "Anchoring the form on chain so anyone can find it",
        },
        indexing: {
            title: "Saving to your forms…",
            sub: "Adding it to your dashboard",
        },
    } as const;
    return (
        <div className="flex flex-col items-center py-8 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)] flex items-center justify-center">
                <Loader2 size={24} className="text-[#a78bfa] animate-spin" />
            </div>
            <div>
                <p className="font-semibold text-[color:var(--text-primary)]">{copy[step].title}</p>
                <p className="text-sm text-[color:var(--text-muted)] mt-1">{copy[step].sub}</p>
                {step === "uploading" && showSlowHint && (
                    <p className="text-xs text-[color:var(--text-muted)] mt-3 max-w-xs mx-auto leading-relaxed">
                        Walrus testnet can take a while or briefly rate-limit. Keep this modal open — we’ll show success here as soon as the publish completes.
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Step: Done ─────────────────────────────────────────────────────────────

function DoneStep({
    formConfig,
    keypair,
    onClose,
}: {
    formConfig: FormConfig;
    keypair: FormKeypair | null;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const [keyDownloaded, setKeyDownloaded] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const formIdForUrl = formConfig.pointerId ?? formConfig.walrusBlobId ?? formConfig.id;
    const formUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/f?id=${formIdForUrl}`;

    const copyLink = async () => {
        await navigator.clipboard.writeText(formUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadKey = async () => {
        if (!keypair) return;
        const json = buildKeyBackup(
            formIdForUrl,
            formConfig.title || "Untitled form",
            keypair.privateKeyJwk,
        );
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const slug = (formConfig.title || "scrolls-form")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 32) || "scrolls-form";
        a.download = `${slug}-decryption-key.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setKeyDownloaded(true);

        // Now that the user has a backup, harden the in-browser copy:
        // re-import the JWK as a non-extractable CryptoKey, persist it
        // in IndexedDB, and remove the raw JWK from localStorage. From
        // this point on the private bytes are unreachable from JS.
        try {
            const hardened = await storeHardenedFormPrivateKey(
                formIdForUrl,
                keypair.privateKeyJwk,
            );
            if (hardened) removeFormPrivateKey(formIdForUrl);
        } catch {
            // keep the legacy JWK as a fallback
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col items-center py-4 text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-[#a78bfa]/10 border border-[#a78bfa]/20 flex items-center justify-center">
                    <Icon icon="fluent:checkmark-24-filled" className="w-7 h-7 text-[#a78bfa]" />
                </div>
                <div>
                    <p className="font-display font-bold text-[color:var(--text-primary)] text-lg">Form published!</p>
                    <p className="text-sm text-[color:var(--text-secondary)] mt-1">
                        Stored permanently on Walrus
                    </p>
                </div>
            </div>

            {/* Share link */}
            <div className="p-3 rounded-xl bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)] flex items-center gap-2">
                <span className="flex-1 text-xs text-[color:var(--text-secondary)] truncate font-mono">
                    {formUrl}
                </span>
                <button
                    onClick={copyLink}
                    className="text-[color:var(--text-muted)] hover:text-[#a78bfa] transition-colors shrink-0"
                    aria-label="Copy link"
                >
                    {copied ? <Check size={14} className="text-[#a78bfa]" /> : <Copy size={14} />}
                </button>
                <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--text-muted)] hover:text-[#a78bfa] transition-colors shrink-0"
                    aria-label="Open form"
                >
                    <ExternalLink size={14} />
                </a>
            </div>

            {/* Share card / short link */}
            <button
                onClick={() => setShareOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#a78bfa] text-[#0a0a0a] text-sm font-semibold hover:bg-[#c4b5fd] transition-colors"
            >
                <LinkIcon size={14} />
                Open share card &amp; QR
            </button>

            {/* Decryption key backup (private forms only) */}
            {keypair && (
                <div className="p-3 rounded-xl border border-[#06b6d4]/25 bg-[#06b6d4]/5">
                    <div className="flex items-start gap-2 mb-3">
                        <Lock size={14} className="text-[#06b6d4] mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                                Save your decryption key
                            </p>
                            <p className="text-[11px] text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                                Without this file, encrypted responses can’t be read on a different
                                browser. We’ve already saved a copy to this device.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={downloadKey}
                        className={clsx(
                            "w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors",
                            keyDownloaded
                                ? "bg-[#06b6d4]/15 text-[#06b6d4]"
                                : "bg-[#06b6d4] text-[#0a0a0a] hover:bg-[#22d3ee]",
                        )}
                    >
                        {keyDownloaded ? (
                            <><Check size={12} /> Backup downloaded</>
                        ) : (
                            <><Download size={12} /> Download key backup (.json)</>
                        )}
                    </button>
                </div>
            )}

            {/* Blob ID */}
            {formConfig.walrusBlobId && (
                <div className="text-xs text-[#333333]">
                    <span className="text-[color:var(--text-muted)]">Walrus blob:</span>{" "}
                    <span className="font-mono">{formConfig.walrusBlobId.slice(0, 24)}…</span>
                </div>
            )}

            <button
                onClick={onClose}
                className="w-full py-2.5 border border-[color:var(--border-subtle)] rounded-xl text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] transition-colors"
            >
                Done
            </button>

            <AnimatePresence>
                {shareOpen && (
                    <ShareCardModal
                        title={formConfig.title || "Untitled form"}
                        canonicalUrl={formUrl}
                        isPrivate={formConfig.settings.isPrivate}
                        blobId={formConfig.walrusBlobId}
                        onClose={() => setShareOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Step: Error ────────────────────────────────────────────────────────────

function ErrorStep({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="space-y-4 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <Icon icon="fluent:dismiss-circle-24-regular" className="w-7 h-7 text-red-400" />
            </div>
            <div>
                <p className="font-semibold text-[color:var(--text-primary)]">Publish failed</p>
                <p className="text-sm text-[color:var(--text-secondary)] mt-1 max-w-xs mx-auto">{message}</p>
            </div>
            <button
                onClick={onRetry}
                className="px-6 py-2.5 bg-[#a78bfa] text-[#0a0a0a] font-semibold rounded-xl text-sm hover:bg-[#c4b5fd] transition-colors"
            >
                Try again
            </button>
        </div>
    );
}

// ── Main Modal ─────────────────────────────────────────────────────────────

export default function PublishModal({
    formConfig,
    localDraftId,
    onClose,
    onPublished,
    setIsPublishing,
}: PublishModalProps) {
    const [step, setStep] = useState<Step>("confirm");
    const [errorMessage, setErrorMessage] = useState("");
    const [publishedConfig, setPublishedConfig] = useState<FormConfig | null>(null);
    const [keypair, setKeypair] = useState<FormKeypair | null>(null);
    // If the Walrus upload succeeded but the on-chain registration was
    // rejected/failed, we remember the uploaded blob so retry can re-attempt
    // only the registry step instead of re-paying for another upload.
    const [pendingBlobId, setPendingBlobId] = useState<string | null>(null);
    const [pendingDraft, setPendingDraft] = useState<FormConfig | null>(null);
    const account = useScrollsAccount();
    const dAppKit = useScrollsDAppKit();

    const handlePublish = async () => {
        setIsPublishing(true);
        try {
            const ownerAddress = account?.address ?? formConfig.ownerAddress ?? "";
            // Smart retry: if a previous attempt got past Walrus upload and
            // only the on-chain step failed, reuse the existing blob so the
            // user doesn't pay for a second upload.
            const reuseBlob = pendingBlobId && pendingDraft;
            let draftWithOwner: FormConfig = reuseBlob
                ? pendingDraft!
                : {
                    ...formConfig,
                    ownerAddress,
                    updatedAt: new Date().toISOString(),
                };

            // Step 0 (private only): provision Seal policy.
            // Hard requirement: Seal must be wired on the active network.
            // No silent ECIES fallback — if the user toggled "private"
            // on a network without Seal, the UI should have prevented it;
            // we double-check here and abort with a clear message.
            if (draftWithOwner.settings.isPrivate) {
                if (!hasSeal() || !hasOnchainRegistry()) {
                    throw new Error(
                        "Private (encrypted) forms aren't available on this network yet. " +
                        "Turn off the Private toggle in form settings to publish a public form.",
                    );
                }
                if (!account?.address || !dAppKit) {
                    throw new Error(
                        "Connect your Sui wallet to publish a private form \u2014 it needs a signature to create the on-chain policy.",
                    );
                }
                setStep("policy");
                const { policyId } = await createPolicy(dAppKit);
                draftWithOwner = { ...draftWithOwner, policyId };
            }

            // Step 1: Upload FormConfig JSON to Walrus.
            // The blob ID becomes the canonical form ID — anyone with the
            // share link can fetch the form definition directly.
            // Skip if we're retrying after an on-chain rejection.
            let blobId: string;
            if (reuseBlob) {
                blobId = pendingBlobId!;
            } else {
                setStep("uploading");
                blobId = await uploadJSON(draftWithOwner);
            }

            // Step 2 (best-effort): register the form on chain so it shows
            // up on the owner's dashboard from any device and so submissions
            // can be anchored back to a discoverable parent.
            let pointerId: string | undefined;
            if (account?.address && dAppKit && hasOnchainRegistry()) {
                setStep("registering");
                try {
                    const out = await publishForm(dAppKit, blobId);
                    pointerId = out.pointerId;
                } catch (regErr) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[PublishModal] on-chain register failed:", regErr);
                    }
                    // Remember the uploaded blob so the user can retry the
                    // on-chain step without paying for another Walrus upload.
                    setPendingBlobId(blobId);
                    setPendingDraft(draftWithOwner);
                    const raw = regErr instanceof Error ? regErr.message : String(regErr);
                    const rejected = /reject|denied|cancell?ed|user denied|user reject/i.test(raw);
                    throw new Error(
                        rejected
                            ? "You rejected the wallet signature. The form was uploaded to Walrus, but on-chain registration was skipped \u2014 it won't sync across devices yet. Retry to sign again without re-uploading."
                            : `On-chain registration failed: ${raw}. The form blob is on Walrus; retry to re-attempt the on-chain sync.`,
                    );
                }
            }

            const final: FormConfig = {
                ...draftWithOwner,
                id: pointerId ?? blobId,
                walrusBlobId: blobId,
                pointerId,
            };

            // Step 3: Index in the owner's local form list so it shows on
            // their dashboard immediately. The on-chain registry powers
            // cross-device discovery; this localStorage cache makes the
            // dashboard render instantly without waiting for events.
            setStep("indexing");
            addForm(account?.address ?? null, {
                formId: final.id,
                title: final.title || "Untitled form",
                createdAt: final.createdAt,
                fieldCount: final.fields.length,
                isPrivate: final.settings.isPrivate,
            });

            // Remove the local draft now that it's published on Walrus
            if (localDraftId) {
                removeDraft(localDraftId);
            }

            setPublishedConfig(final);
            // Successful end-to-end publish: clear any stale pending blob.
            setPendingBlobId(null);
            setPendingDraft(null);
            setStep("done");
            onPublished(final);
        } catch (err) {
            if (process.env.NODE_ENV === "development") {
                console.error("[PublishModal] publish failed:", err);
            }
            setErrorMessage(err instanceof Error ? err.message : String(err));
            setStep("error");
        } finally {
            setIsPublishing(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case "confirm":
                return <ConfirmStep formConfig={formConfig} onPublish={handlePublish} />;
            case "keygen":
            case "policy":
            case "uploading":
            case "registering":
            case "indexing":
                return <LoadingStep step={step} />;
            case "done":
                return (
                    <DoneStep
                        formConfig={publishedConfig ?? formConfig}
                        keypair={keypair}
                        onClose={onClose}
                    />
                );
            case "error":
                return (
                    <ErrorStep
                        message={errorMessage}
                        onRetry={() => setStep("confirm")}
                    />
                );
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                variants={backdropVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={(e) => {
                    if (e.target === e.currentTarget && step !== "keygen" && step !== "policy" && step !== "uploading" && step !== "registering" && step !== "indexing") {
                        onClose();
                    }
                }}
            >
                <motion.div
                    key="modal"
                    variants={modalVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
                    className="w-full max-w-sm bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-2xl relative"
                >
                    {/* Close button */}
                    {step !== "keygen" && step !== "policy" && step !== "uploading" && step !== "registering" && step !== "indexing" && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-[#333333] hover:text-[color:var(--text-secondary)] transition-colors"
                            aria-label="Close"
                        >
                            <X size={16} />
                        </button>
                    )}

                    {renderStep()}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
