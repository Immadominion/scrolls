"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { Star } from "lucide-react";
import clsx from "clsx";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Linkified } from "@/lib/linkify";
import { truncateAddress } from "@/lib/sui";
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

// ── DetailsPanel ──────────────────────────────────────────────────────────

function DetailRow({
    icon,
    label,
    value,
    muted,
}: {
    icon: string;
    label: string;
    value: string;
    muted?: boolean;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 w-6 h-6 rounded-lg bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)] flex items-center justify-center shrink-0">
                <Icon icon={icon} className="w-3.5 h-3.5 text-[color:var(--text-muted)]" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-muted)] mb-0.5">{label}</p>
                <p className={clsx("text-sm break-all", muted ? "text-[color:var(--text-muted)] italic" : "text-[color:var(--text-primary)]")}>
                    {value}
                </p>
            </div>
        </div>
    );
}

function AddressChip({ address, label }: { address: string; label?: string }) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)]">
            <div className="w-2 h-2 rounded-full bg-[#a78bfa] shrink-0" />
            <span className="font-mono text-xs text-[color:var(--text-primary)]">{truncateAddress(address)}</span>
            {label && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--background-subtle)] text-[color:var(--text-muted)]">
                    {label}
                </span>
            )}
        </div>
    );
}

function DetailsPanel({ formConfig }: { formConfig: FormConfig }) {
    const { settings, ownerAddress, admins } = formConfig;
    const allViewers = [
        { address: ownerAddress, label: "Owner" },
        ...(admins ?? []).filter(Boolean).map((a) => ({ address: a, label: "Admin" })),
    ];

    return (
        <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
            {/* Banner */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#a78bfa]/8 border border-[#a78bfa]/20 text-[11px] text-[#a78bfa]">
                <Icon icon="fluent:eye-off-24-regular" className="w-4 h-4 shrink-0" />
                <span>This info is visible to you (the creator) only — respondents never see it.</span>
            </div>

            {/* Visibility */}
            <section>
                <p className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Icon icon="fluent:people-24-regular" className="w-3.5 h-3.5" />
                    Who can see responses
                </p>
                <div className="space-y-2">
                    {allViewers.length > 0 ? (
                        allViewers.map(({ address, label }) =>
                            address ? (
                                <AddressChip key={address} address={address} label={label} />
                            ) : null,
                        )
                    ) : (
                        <p className="text-sm text-[color:var(--text-muted)] italic">No owner set — publish to assign.</p>
                    )}
                    {(admins ?? []).length === 0 && ownerAddress && (
                        <p className="text-xs text-[color:var(--text-muted)] mt-1">
                            No extra admins. Add them in Settings → Admins.
                        </p>
                    )}
                </div>
            </section>

            {/* Response settings */}
            <section>
                <p className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Icon icon="fluent:settings-24-regular" className="w-3.5 h-3.5" />
                    Response settings
                </p>
                <div className="space-y-4">
                    <DetailRow
                        icon="fluent:lock-24-regular"
                        label="Privacy"
                        value={settings.isPrivate ? "End-to-end encrypted" : "Public — responses are readable by anyone with the blob ID"}
                    />
                    <DetailRow
                        icon="fluent:person-24-regular"
                        label="Respondents"
                        value={settings.allowAnonymous ? "Anyone — no wallet required" : "Wallet required"}
                    />
                    {settings.maxResponses != null && (
                        <DetailRow
                            icon="fluent:number-symbol-24-regular"
                            label="Response cap"
                            value={`${settings.maxResponses} responses`}
                        />
                    )}
                    {settings.closesAt && (
                        <DetailRow
                            icon="fluent:calendar-24-regular"
                            label="Closes at"
                            value={new Date(settings.closesAt).toLocaleString()}
                        />
                    )}
                </div>
            </section>

            {/* After submit */}
            <section>
                <p className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Icon icon="fluent:checkmark-circle-24-regular" className="w-3.5 h-3.5" />
                    After submit
                </p>
                <div className="space-y-4">
                    <DetailRow
                        icon="fluent:chat-24-regular"
                        label="Confirmation message"
                        value={settings.confirmationMessage || "Your response is stored permanently on Walrus."}
                        muted={!settings.confirmationMessage}
                    />
                    {settings.postSubmitNote ? (
                        <DetailRow
                            icon="fluent:note-24-regular"
                            label="Creator note"
                            value={settings.postSubmitNote}
                        />
                    ) : (
                        <DetailRow
                            icon="fluent:note-24-regular"
                            label="Creator note"
                            value="Not set — add one in Settings → After submit"
                            muted
                        />
                    )}
                </div>
            </section>
        </div>
    );
}

// ── FormPreview ────────────────────────────────────────────────────────────

interface FormPreviewProps {
    formConfig: FormConfig;
}

export default function FormPreview({ formConfig }: FormPreviewProps) {
    const [submitted, setSubmitted] = useState(false);
    const [tab, setTab] = useState<"form" | "details">("form");

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-16">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
                    className="flex flex-col items-center gap-5 max-w-sm text-center px-6"
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
                            {formConfig.settings.confirmationMessage ??
                                "Your response is stored permanently on Walrus."}
                        </p>
                    </div>
                    {formConfig.settings.postSubmitNote && (
                        <div className="w-full mt-1 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-panel)] p-4 text-left">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">
                                <Icon icon="fluent:note-24-regular" className="w-3 h-3" />
                                A note from the creator
                            </div>
                            <p className="text-xs text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                                <Linkified text={formConfig.settings.postSubmitNote} />
                            </p>
                        </div>
                    )}
                    <button
                        onClick={() => setSubmitted(false)}
                        className="text-xs text-[color:var(--text-muted)] hover:text-[#a78bfa] transition-colors mt-1"
                    >
                        ← Back to preview
                    </button>
                    <p className="text-[10px] text-[color:var(--text-soft)]">Preview · no data was sent</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Tab bar — sticky at the top of the preview pane */}
            <div className="sticky top-0 z-10 flex items-center gap-1 px-4 py-2.5 bg-[color:var(--background-app)] border-b border-[color:var(--border-subtle)] shrink-0">
                <button
                    type="button"
                    onClick={() => setTab("form")}
                    className={clsx(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150",
                        tab === "form"
                            ? "bg-[color:var(--surface-solid)] text-[color:var(--text-primary)] border border-[color:var(--border-default)]"
                            : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
                    )}
                >
                    <Icon icon="fluent:form-24-regular" className="w-3.5 h-3.5" />
                    Form preview
                </button>
                <button
                    type="button"
                    onClick={() => setTab("details")}
                    className={clsx(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150",
                        tab === "details"
                            ? "bg-[color:var(--surface-solid)] text-[color:var(--text-primary)] border border-[color:var(--border-default)]"
                            : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
                    )}
                >
                    <Icon icon="fluent:info-24-regular" className="w-3.5 h-3.5" />
                    Details
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {tab === "details" ? (
                    <DetailsPanel formConfig={formConfig} />
                ) : (
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
                )}
            </div>
        </div>
    );
}
