"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { Star } from "lucide-react";
import clsx from "clsx";
import type { FormConfig, FormField } from "@/types";

// ── Field Renderers ────────────────────────────────────────────────────────

function ShortTextField({ field }: { field: FormField }) {
    return (
        <input
            type="text"
            placeholder={field.placeholder ?? "Type your answer…"}
            className="w-full px-4 py-3 bg-[color:var(--surface-solid)] border border-[color:var(--border-default)] rounded-2xl text-[color:var(--text-primary)] placeholder:text-[#333333] text-sm outline-none focus:border-[color:var(--brand-primary-soft)] transition-colors"
        />
    );
}

function LongTextField({ field }: { field: FormField }) {
    return (
        <textarea
            rows={4}
            placeholder={field.placeholder ?? "Type your answer…"}
            className="w-full px-4 py-3 bg-[color:var(--surface-solid)] border border-[color:var(--border-default)] rounded-2xl text-[color:var(--text-primary)] placeholder:text-[#333333] text-sm outline-none focus:border-[color:var(--brand-primary-soft)] transition-colors resize-none"
        />
    );
}

function UrlField({ field }: { field: FormField }) {
    return (
        <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2">
                <Icon icon="fluent:link-24-regular" className="w-4 h-4 text-[color:var(--text-muted)]" />
            </span>
            <input
                type="url"
                placeholder={field.placeholder ?? "https://…"}
                className="w-full pl-9 pr-4 py-3 bg-[color:var(--surface-solid)] border border-[color:var(--border-default)] rounded-2xl text-[color:var(--text-primary)] placeholder:text-[#333333] text-sm outline-none focus:border-[color:var(--brand-primary-soft)] transition-colors"
            />
        </div>
    );
}

function DropdownField({ field }: { field: FormField }) {
    return (
        <select className="w-full px-4 py-3 bg-[color:var(--surface-solid)] border border-[color:var(--border-default)] rounded-2xl text-[color:var(--text-primary)] text-sm outline-none focus:border-[color:var(--brand-primary-soft)] transition-colors appearance-none cursor-pointer">
            <option value="">Select an option…</option>
            {field.options?.map((opt) => (
                <option key={opt.id} value={opt.id}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}

function MultiSelectField({ field }: { field: FormField }) {
    const [selected, setSelected] = useState<string[]>([]);
    const toggle = (id: string) =>
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );

    return (
        <div className="space-y-2">
            {field.options?.map((opt) => (
                <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    className={clsx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm text-left transition-colors duration-150",
                        selected.includes(opt.id)
                            ? "border-[#a78bfa]/50 bg-[#a78bfa]/5 text-[color:var(--text-primary)]"
                            : "border-[color:var(--border-default)] bg-[color:var(--surface-solid)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)]"
                    )}
                >
                    <span
                        className={clsx(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                            selected.includes(opt.id)
                                ? "border-[#a78bfa] bg-[#a78bfa]"
                                : "border-[color:var(--border-strong)]"
                        )}
                    >
                        {selected.includes(opt.id) && (
                            <Icon icon="fluent:checkmark-12-filled" className="w-3 h-3 text-[color:var(--text-primary)]" />
                        )}
                    </span>
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function StarRatingField({ field }: { field: FormField }) {
    const [hovered, setHovered] = useState(0);
    const [rating, setRating] = useState(0);
    const count = field.maxStars ?? 5;

    return (
        <div className="flex gap-1">
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
                <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(n)}
                    className="transition-transform duration-100 hover:scale-110 active:scale-95"
                >
                    <Star
                        size={24}
                        className={clsx(
                            "transition-colors duration-100",
                            n <= (hovered || rating)
                                ? "fill-[#a78bfa] stroke-[#a78bfa]"
                                : "stroke-[#333333] fill-transparent"
                        )}
                    />
                </button>
            ))}
        </div>
    );
}

function FileUploadField({ field }: { field: FormField }) {
    return (
        <label className="flex flex-col items-center justify-center gap-3 p-8  border-dashed border-[color:var(--border-default)] rounded-2xl cursor-pointer hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-solid)]/50 transition-colors group">
            <Icon
                icon={
                    field.type === "video_upload"
                        ? "fluent:video-clip-24-regular"
                        : "fluent:document-arrow-up-24-regular"
                }
                className="w-8 h-8 text-[#333333] group-hover:text-[color:var(--text-muted)] transition-colors"
            />
            <div className="text-center">
                <p className="text-sm text-[color:var(--text-secondary)]">
                    Drop your {field.type === "video_upload" ? "video" : "file"} here, or{" "}
                    <span className="text-[#a78bfa]">browse</span>
                </p>
                {field.maxFileSizeMB && (
                    <p className="text-xs text-[color:var(--text-muted)] mt-1">
                        Up to {field.maxFileSizeMB}MB
                    </p>
                )}
            </div>
            <input type="file" className="sr-only" accept={field.type === "video_upload" ? "video/*" : undefined} />
        </label>
    );
}

function ConfirmCheckboxField({ field }: { field: FormField }) {
    const [checked, setChecked] = useState(false);
    return (
        <button
            type="button"
            onClick={() => setChecked((p) => !p)}
            className="flex items-start gap-3 text-left"
        >
            <span
                className={clsx(
                    "mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors duration-150",
                    checked ? "border-[#a78bfa] bg-[#a78bfa]" : "border-[color:var(--border-strong)] bg-transparent"
                )}
            >
                {checked && (
                    <Icon icon="fluent:checkmark-12-filled" className="w-3 h-3 text-[color:var(--text-primary)]" />
                )}
            </span>
            <span className="text-sm text-[color:var(--text-secondary)]">
                {field.placeholder ?? "I agree to the terms"}
            </span>
        </button>
    );
}

// ── Field Wrapper ──────────────────────────────────────────────────────────

function FieldWrapper({ field, index }: { field: FormField; index: number }) {
    const renderField = () => {
        switch (field.type) {
            case "short_text": return <ShortTextField field={field} />;
            case "long_text": return <LongTextField field={field} />;
            case "rich_text": return <LongTextField field={field} />; // simplified for preview
            case "url": return <UrlField field={field} />;
            case "dropdown": return <DropdownField field={field} />;
            case "multi_select": return <MultiSelectField field={field} />;
            case "star_rating": return <StarRatingField field={field} />;
            case "file_upload":
            case "video_upload": return <FileUploadField field={field} />;
            case "confirm_checkbox": return <ConfirmCheckboxField field={field} />;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04, ease: [0.25, 0.4, 0.25, 1] }}
            className="space-y-2"
        >
            <label className="block text-sm font-medium text-[color:var(--text-primary)]">
                {field.label}
                {field.required && (
                    <span className="ml-1 text-[#a78bfa]" aria-hidden="true">*</span>
                )}
            </label>
            {renderField()}
        </motion.div>
    );
}

// ── FormPreview ────────────────────────────────────────────────────────────

interface FormPreviewProps {
    formConfig: FormConfig;
}

export default function FormPreview({ formConfig }: FormPreviewProps) {
    const [submitted, setSubmitted] = useState(false);

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-24">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
                    className="text-center space-y-4"
                >
                    <div className="w-16 h-16 rounded-2xl bg-[#a78bfa]/10 border border-[#a78bfa]/20 flex items-center justify-center mx-auto">
                        <Icon icon="fluent:checkmark-24-filled" className="w-8 h-8 text-[#a78bfa]" />
                    </div>
                    <h2 className="text-2xl font-display font-bold text-[color:var(--text-primary)]">Thank you!</h2>
                    <p className="text-[color:var(--text-secondary)] text-sm max-w-xs">
                        {formConfig.settings.confirmationMessage ??
                            "Your response has been submitted and stored permanently on Walrus."}
                    </p>
                    <button
                        onClick={() => setSubmitted(false)}
                        className="text-sm text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
                    >
                        Submit another response
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto px-6 py-12">
            {/* Form header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
                className="mb-10"
            >
                <div className="flex items-center gap-2 text-[color:var(--text-muted)] text-xs mb-6">
                    <Icon icon="fluent:scroll-24-regular" className="w-4 h-4 text-[#a78bfa]" />
                    <span className="font-display">Scrolls</span>
                    <span>·</span>
                    <span>Preview mode</span>
                </div>
                <h1 className="text-3xl font-display font-bold text-[color:var(--text-primary)] mb-2">
                    {formConfig.title || "Untitled form"}
                </h1>
                {formConfig.description && (
                    <p className="text-[color:var(--text-secondary)] text-sm leading-relaxed">
                        {formConfig.description}
                    </p>
                )}
            </motion.div>

            {/* Fields */}
            {formConfig.fields.length === 0 ? (
                <p className="text-center text-[color:var(--text-muted)] text-sm py-12">
                    No fields yet. Add some in the editor.
                </p>
            ) : (
                <div className="space-y-8">
                    {formConfig.fields.map((field, i) => (
                        <FieldWrapper key={field.id} field={field} index={i} />
                    ))}

                    {/* Submit */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: formConfig.fields.length * 0.04 + 0.2 }}
                        className="pt-4"
                    >
                        <button
                            onClick={() => setSubmitted(true)}
                            className="px-8 py-3 bg-[#a78bfa] text-[#0a0a0a] font-semibold rounded-2xl hover:bg-[#c4b5fd] transition-colors duration-200 text-sm"
                        >
                            Submit
                        </button>
                        <p className="text-xs text-[#333333] mt-3">
                            Responses are stored permanently on{" "}
                            <span className="text-[color:var(--text-muted)]">Walrus</span>
                            {formConfig.settings.isPrivate && (
                                <> · <span className="text-[#06b6d4]">End-to-end encrypted</span></>
                            )}
                        </p>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
