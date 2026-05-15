"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import FieldCanvas from "./FieldCanvas";
import FieldLibraryDrawer from "./FieldLibraryDrawer";
import FloatingAiPrompt from "./FloatingAiPrompt";
import FieldConfigPanel from "./FieldConfigPanel";
import type { FormConfig, FormField, FieldType } from "@/types";
import PublishModal from "./PublishModal";
import BuilderHeader from "./BuilderHeader";
import FormPreview from "./FormPreview";
import MouseGlow from "@/components/ui/MouseGlow";
import DotGrid from "@/components/ui/DotGrid";
import { generateFormFromPrompt } from "@/lib/ai-form-builder";
import { deleteAIDraft, loadAIDraft } from "@/lib/ai-draft-storage";
import { fetchJSON } from "@/lib/walrus";
import { removeForm } from "@/lib/formIndex";
import { saveDraft, getDraft, removeDraft } from "@/lib/draftIndex";
import { randomUUID } from "@/lib/uuid";

// ── Initial State ──────────────────────────────────────────────────────────

function createDefaultField(type: FieldType): FormField {
    const base = {
        id: randomUUID(),
        type,
        label: FIELD_DEFAULTS[type].label,
        required: false,
    } as FormField;

    if (type === "dropdown" || type === "multi_select") {
        return {
            ...base,
            options: [
                { id: randomUUID(), label: "Option 1" },
                { id: randomUUID(), label: "Option 2" },
            ],
        };
    }
    if (type === "star_rating") {
        return { ...base, maxStars: 5 };
    }
    return base;
}

const FIELD_DEFAULTS: Record<FieldType, { label: string }> = {
    short_text: { label: "Short answer" },
    long_text: { label: "Long answer" },
    rich_text: { label: "Rich text" },
    dropdown: { label: "Dropdown" },
    multi_select: { label: "Multiple choice" },
    star_rating: { label: "Star rating" },
    file_upload: { label: "File upload" },
    video_upload: { label: "Video upload" },
    url: { label: "URL" },
    confirm_checkbox: { label: "Confirmation" },
};

function createEmptyForm(): FormConfig {
    return {
        id: randomUUID(),
        title: "Untitled form",
        description: "",
        fields: [],
        settings: {
            isPrivate: false,
            allowAnonymous: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerAddress: "",
    };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BuilderLayout() {
    const searchParams = useSearchParams();
    const editFormBlobId = searchParams.get("id")?.trim() ?? "";
    const aiPromptParam = searchParams.get("prompt")?.trim() ?? "";
    const aiDraftId = searchParams.get("draft")?.trim() ?? "";
    const localDraftIdParam = searchParams.get("localDraft")?.trim() ?? "";
    const isAiMode = searchParams.get("mode") === "ai";
    // Stable local draft ID for auto-save — from URL param or new UUID
    const [localDraftId] = useState(() => localDraftIdParam || randomUUID());
    const [formConfig, setFormConfig] = useState<FormConfig>(() => {
        // If opening a specific local draft, restore it immediately
        if (localDraftIdParam) {
            const saved = getDraft(localDraftIdParam);
            if (saved) return saved.formConfig;
        }
        return createEmptyForm();
    });
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [isPreview, setIsPreview] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [aiStatus, setAiStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
    const [libraryPinned, setLibraryPinned] = useState(false);
    const [libraryHovered, setLibraryHovered] = useState(false);
    const [aiSource, setAiSource] = useState<"claude-haiku" | null>(null);
    const [aiTrace, setAiTrace] = useState<{ used: number; transcribed: number; skipped: number } | null>(null);
    const [aiPrompt, setAiPrompt] = useState(aiPromptParam);
    const [aiAttachments, setAiAttachments] = useState<File[]>([]);
    const [aiInputReady, setAiInputReady] = useState(!isAiMode || !aiDraftId);
    const [aiError, setAiError] = useState<string | null>(null);
    const [editLoadState, setEditLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [editLoadError, setEditLoadError] = useState<string | null>(null);
    const aiRanRef = useRef(false);

    // ── Auto-save draft to localStorage (debounced 800ms) ─────────────────
    // Skipped when editing an existing published form (editFormBlobId)
    // and while AI is still generating (nothing useful to save yet).
    useEffect(() => {
        if (editFormBlobId) return;
        if (aiStatus === "generating") return;
        const timeout = setTimeout(() => {
            saveDraft({
                draftId: localDraftId,
                title: formConfig.title || "Untitled form",
                fieldCount: formConfig.fields.length,
                isPrivate: formConfig.settings.isPrivate,
                updatedAt: new Date().toISOString(),
                formConfig,
            });
        }, 800);
        return () => clearTimeout(timeout);
    }, [formConfig, localDraftId, editFormBlobId, aiStatus]);

    // ── Rehydrate builder from a published form (?id=<walrusBlobId>) ──────

    useEffect(() => {
        if (!editFormBlobId || isAiMode) return;

        let cancelled = false;
        setEditLoadState("loading");
        setEditLoadError(null);

        (async () => {
            try {
                const fromWalrus = await fetchJSON<FormConfig>(editFormBlobId);
                if (cancelled) return;

                // Keep the route ID canonical for edit/republish flows.
                setFormConfig({
                    ...fromWalrus,
                    id: editFormBlobId,
                    walrusBlobId: editFormBlobId,
                    updatedAt: new Date().toISOString(),
                });
                setSelectedFieldId(null);
                setEditLoadState("ready");
            } catch (err) {
                if (cancelled) return;
                setEditLoadError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load the selected form from Walrus.",
                );
                setEditLoadState("error");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [editFormBlobId, isAiMode]);

    // ── Resolve AI input from URL prompt or draft ID ───────────────────────

    useEffect(() => {
        if (!isAiMode) return;

        if (!aiDraftId) {
            setAiPrompt(aiPromptParam);
            setAiAttachments([]);
            setAiInputReady(true);
            return;
        }

        let cancelled = false;
        setAiInputReady(false);
        setAiError(null);

        (async () => {
            try {
                const draft = await loadAIDraft(aiDraftId);
                if (cancelled) return;
                if (!draft) {
                    setAiError("AI draft not found. Please go back and regenerate from the home page.");
                    setAiStatus("error");
                    setAiInputReady(true);
                    return;
                }

                setAiPrompt(draft.prompt.trim());
                setAiAttachments(draft.attachments);
                setAiInputReady(true);

                // One-time draft payload; safe to delete after hydration.
                void deleteAIDraft(aiDraftId);
            } catch (err) {
                if (cancelled) return;
                setAiError(err instanceof Error ? err.message : "Failed to load AI draft.");
                setAiStatus("error");
                setAiInputReady(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isAiMode, aiDraftId, aiPromptParam]);

    // ── AI generation on mount when ?mode=ai&prompt=... ───────────────────

    useEffect(() => {
        if (!isAiMode || !aiInputReady || !aiPrompt || aiRanRef.current) return;
        aiRanRef.current = true;
        let cancelled = false;
        setAiStatus("generating");
        setAiError(null);

        generateFormFromPrompt(aiPrompt, aiAttachments)
            .then(({ config, source, usedAttachmentCount, transcribedAttachmentCount, skippedAttachments }) => {
                if (cancelled) return;
                setFormConfig((prev) => ({
                    ...config,
                    // Preserve any owner address that may have been set elsewhere
                    ownerAddress: prev.ownerAddress,
                }));
                setSelectedFieldId(null);
                setAiSource(source);
                setAiTrace({
                    used: usedAttachmentCount,
                    transcribed: transcribedAttachmentCount,
                    skipped: skippedAttachments.length,
                });
                setAiStatus("ready");
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setAiError(err instanceof Error ? err.message : "Unknown error");
                setAiStatus("error");
            });

        return () => {
            cancelled = true;
        };
    }, [isAiMode, aiInputReady, aiPrompt, aiAttachments]);

    // ── Field Operations ──────────────────────────────────────────────────

    const addField = useCallback((type: FieldType) => {
        const newField = createDefaultField(type);
        setFormConfig((prev) => ({
            ...prev,
            fields: [...prev.fields, newField],
            updatedAt: new Date().toISOString(),
        }));
        setSelectedFieldId(newField.id);
    }, []);

    const updateField = useCallback((id: string, updates: Partial<FormField>) => {
        setFormConfig((prev) => ({
            ...prev,
            fields: prev.fields.map((f) =>
                f.id === id ? { ...f, ...updates } as FormField : f
            ),
            updatedAt: new Date().toISOString(),
        }));
    }, []);

    const deleteField = useCallback((id: string) => {
        setFormConfig((prev) => {
            const idx = prev.fields.findIndex((f) => f.id === id);
            const newFields = prev.fields.filter((f) => f.id !== id);
            return { ...prev, fields: newFields, updatedAt: new Date().toISOString() };
        });
        setSelectedFieldId(null);
    }, []);

    const reorderFields = useCallback((orderedIds: string[]) => {
        setFormConfig((prev) => {
            const map = Object.fromEntries(prev.fields.map((f) => [f.id, f]));
            return {
                ...prev,
                fields: orderedIds.map((id) => map[id]).filter(Boolean) as FormField[],
                updatedAt: new Date().toISOString(),
            };
        });
    }, []);

    const updateTitle = useCallback((title: string) => {
        setFormConfig((prev) => ({ ...prev, title, updatedAt: new Date().toISOString() }));
    }, []);

    const updateDescription = useCallback((description: string) => {
        setFormConfig((prev) => ({ ...prev, description, updatedAt: new Date().toISOString() }));
    }, []);

    const updateSettings = useCallback((updates: Partial<FormConfig["settings"]>) => {
        setFormConfig((prev) => ({
            ...prev,
            settings: { ...prev.settings, ...updates },
            updatedAt: new Date().toISOString(),
        }));
    }, []);

    const handleGenerateWithAI = useCallback(async (prompt: string, incomingAttachments: File[] = []) => {
        const trimmed = prompt.trim();
        if (!trimmed || aiStatus === "generating") return;
        setAiStatus("generating");
        setAiError(null);
        setAiSource(null);
        setAiTrace(null);
        try {
            const { config, source, usedAttachmentCount, transcribedAttachmentCount, skippedAttachments } = await generateFormFromPrompt(trimmed, incomingAttachments);
            setFormConfig((prev) => ({
                ...config,
                ownerAddress: prev.ownerAddress,
            }));
            setSelectedFieldId(null);
            setAiSource(source);
            setAiTrace({
                used: usedAttachmentCount,
                transcribed: transcribedAttachmentCount,
                skipped: skippedAttachments.length,
            });
            setAiStatus("ready");
            setAiPrompt(trimmed);
        } catch (err) {
            setAiError(err instanceof Error ? err.message : "Unknown error");
            setAiStatus("error");
        }
    }, [aiStatus]);

    const selectedField = formConfig.fields.find((f) => f.id === selectedFieldId) ?? null;

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className="h-screen flex flex-col bg-[color:var(--background-app)] overflow-hidden">
            {/* Top bar */}
            <BuilderHeader
                formTitle={formConfig.title}
                onTitleChange={updateTitle}
                isPreview={isPreview}
                onPreviewToggle={() => setIsPreview((p) => !p)}
                onPublish={() => setShowPublishModal(true)}
                isPublishing={isPublishing}
                fieldCount={formConfig.fields.length}
                onOpenLibrary={() => setLibraryPinned((p) => !p)}
                settings={formConfig.settings}
                onUpdateSettings={updateSettings}
            />

            {/* Field library drawer (slide-over from left) */}
            <FieldLibraryDrawer
                open={(libraryPinned || libraryHovered) && !isPreview}
                isPinned={libraryPinned}
                onClose={() => setLibraryPinned(false)}
                onMouseEnter={() => setLibraryHovered(true)}
                onMouseLeave={() => setLibraryHovered(false)}
                onAddField={(type) => {
                    addField(type);
                }}
            />

            {/* Workspace */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Trigger zone for hover-open library */}
                {!isPreview && !libraryPinned && !libraryHovered && (
                    <div
                        className="absolute left-0 top-0 bottom-0 w-8 z-40"
                        onMouseEnter={() => setLibraryHovered(true)}
                    />
                )}

                {/* Center — Canvas or Preview, with docked AI prompt */}
                <main className="relative flex-1 overflow-y-auto">
                    {/* Ambient backdrop — dot grid + cursor glow */}
                    {!isPreview && (
                        <>
                            <DotGrid />
                            <MouseGlow intensity="subtle" />
                        </>
                    )}

                    {!isPreview && isAiMode && aiPrompt && (
                        <div className="mx-auto max-w-2xl px-6 pt-6">
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
                                className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] p-4 backdrop-blur-sm"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <AiStatusPill status={aiStatus} source={aiSource} attachmentCount={aiAttachments.length} trace={aiTrace} />
                                    <span className="text-xs text-[color:var(--text-muted)]">
                                        {aiStatus === "idle" && !aiInputReady && "Loading AI draft..."}
                                        {aiStatus === "generating" && "Claude Haiku is drafting your form…"}
                                        {aiStatus === "ready" && aiSource === "claude-haiku" && "Draft ready. Refine fields, then publish."}
                                        {aiStatus === "error" && `Generation failed: ${aiError ?? "unknown error"}`}
                                        {aiStatus === "idle" && aiInputReady && "Brief loaded. Generation will start shortly."}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                                    {aiPrompt}
                                </p>
                            </motion.div>
                        </div>
                    )}

                    {!isPreview && !isAiMode && !!editFormBlobId && (
                        <div className="mx-auto max-w-2xl px-6 pt-6">
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
                                className={clsx(
                                    "rounded-2xl border p-4 backdrop-blur-sm",
                                    editLoadState === "error"
                                        ? "border-rose-400/25 bg-rose-400/10"
                                        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]",
                                )}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className={clsx(
                                            "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                                            editLoadState === "ready" &&
                                            "border border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
                                            editLoadState === "loading" &&
                                            "border border-[#a78bfa]/25 bg-[#a78bfa]/10 text-[#a78bfa]",
                                            editLoadState === "error" &&
                                            "border border-rose-400/25 bg-rose-400/10 text-rose-300",
                                            editLoadState === "idle" &&
                                            "border border-[#a78bfa]/25 bg-[#a78bfa]/10 text-[#a78bfa]",
                                        )}
                                    >
                                        {editLoadState === "loading" && "Loading form"}
                                        {editLoadState === "ready" && "Edit mode"}
                                        {editLoadState === "error" && "Load failed"}
                                        {editLoadState === "idle" && "Preparing"}
                                    </span>
                                    <span className="text-xs text-[color:var(--text-muted)] font-mono">
                                        {editFormBlobId.slice(0, 10)}…{editFormBlobId.slice(-8)}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                                    {editLoadState === "loading" &&
                                        "Fetching the published form from Walrus so you can edit and republish it."}
                                    {editLoadState === "ready" &&
                                        "You are editing a published form. Republishing will create a new Walrus blob ID."}
                                    {editLoadState === "error" &&
                                        `Could not load form: ${editLoadError ?? "unknown error"}`}
                                    {editLoadState === "idle" && "Preparing edit session."}
                                </p>
                            </motion.div>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {isPreview ? (
                            <motion.div
                                key="preview"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
                                className="relative h-full"
                            >
                                <FormPreview formConfig={formConfig} />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="canvas"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
                                className="relative flex min-h-full flex-col"
                            >
                                <FieldCanvas
                                    formConfig={formConfig}
                                    selectedFieldId={selectedFieldId}
                                    onSelectField={setSelectedFieldId}
                                    onDeleteField={deleteField}
                                    onReorderFields={reorderFields}
                                    onUpdateTitle={updateTitle}
                                    onUpdateDescription={updateDescription}
                                    onAddField={addField}
                                />

                                {/* AI prompt — pinned to the bottom of the canvas
                                    column. `mt-auto` parks it against the viewport
                                    floor when the form is short; when the form grows
                                    past the viewport, the prompt rides along under
                                    the last field and the user scrolls to reach it. */}
                                <div className="mt-auto px-4 pb-6 pt-10">
                                    <FloatingAiPrompt
                                        aiStatus={aiStatus}
                                        aiError={aiError}
                                        initialPrompt={aiPrompt}
                                        onGenerate={handleGenerateWithAI}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                {/* Right Panel for Field Config */}
                <AnimatePresence mode="wait">
                    {!isPreview && selectedField && (
                        <motion.aside
                            key="field-config"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.18, ease: [0.25, 0.4, 0.25, 1] }}
                            className="relative w-80 shrink-0 flex flex-col bg-[color:var(--background-app)] overflow-y-auto z-10"
                        >
                            <div
                                className="pointer-events-none absolute inset-y-0 left-0 w-px"
                                aria-hidden="true"
                                style={{
                                    background:
                                        "linear-gradient(180deg, transparent 0%, rgba(167, 139, 250, 0.22) 50%, transparent 100%)",
                                }}
                            />
                            <FieldConfigPanel
                                field={selectedField}
                                onUpdate={(updates) => updateField(selectedField.id, updates)}
                                onDelete={() => deleteField(selectedField.id)}
                            />
                        </motion.aside>
                    )}
                </AnimatePresence>

            </div>

            {/* Publish modal */}
            <AnimatePresence>
                {showPublishModal && (
                    <PublishModal
                        formConfig={formConfig}
                        localDraftId={editFormBlobId ? undefined : localDraftId}
                        onClose={() => setShowPublishModal(false)}
                        onPublished={(updatedConfig) => {
                            const previousBlobId = editFormBlobId;
                            const nextBlobId = updatedConfig.walrusBlobId ?? "";
                            if (previousBlobId && nextBlobId && previousBlobId !== nextBlobId) {
                                const ownerAddress = updatedConfig.ownerAddress || null;
                                removeForm(ownerAddress, previousBlobId);
                                removeForm(null, previousBlobId);
                            }
                            setFormConfig(updatedConfig);
                        }}
                        setIsPublishing={setIsPublishing}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ── AI status pill ────────────────────────────────────────────────────────

function AiStatusPill({
    status,
    source,
    attachmentCount,
    trace,
}: {
    status: "idle" | "generating" | "ready" | "error";
    source: "claude-haiku" | null;
    attachmentCount: number;
    trace: { used: number; transcribed: number; skipped: number } | null;
}) {
    if (status === "generating") {
        return (
            <span className="inline-flex items-center gap-2 rounded-full border border-[#a78bfa]/25 bg-[#a78bfa]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
                <motion.span
                    aria-hidden="true"
                    className="block h-1.5 w-1.5 rounded-full bg-[#a78bfa]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                />
                Generating
            </span>
        );
    }
    if (status === "ready") {
        // Prefer the real trace from the generator over the raw
        // attachment count — it tells the user how many files Claude
        // actually read (and how many were transcribed audio/video).
        const usedSuffix = trace
            ? trace.used > 0
                ? ` · Used ${trace.used} attachment${trace.used === 1 ? "" : "s"}${trace.transcribed > 0 ? ` (${trace.transcribed} transcribed)` : ""}`
                : trace.skipped > 0
                    ? ` · ${trace.skipped} skipped—see console`
                    : ""
            : attachmentCount > 0
                ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
                : "";
        return (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                {source === "claude-haiku" ? "Claude Haiku" : "Ready"}{usedSuffix}
            </span>
        );
    }
    if (status === "error") {
        return (
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-300">
                Failed
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-[#a78bfa]/25 bg-[#a78bfa]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
            AI brief loaded
        </span>
    );
}
