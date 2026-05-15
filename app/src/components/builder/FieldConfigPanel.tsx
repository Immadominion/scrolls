"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { Trash2, Plus, X } from "lucide-react";
import clsx from "clsx";
import type { FormField, FieldOption } from "@/types";
import { randomUUID } from "@/lib/uuid";

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <p className="text-xs font-medium text-[color:var(--text-muted)] uppercase tracking-wider">
                {title}
            </p>
            {children}
        </div>
    );
}

// ── Input ──────────────────────────────────────────────────────────────────

function ConfigInput({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs text-[color:var(--text-secondary)] ml-1">{label}</label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 text-sm bg-[color:var(--surface-solid)]/80 border border-[color:var(--border-subtle)] rounded-[14px] text-[color:var(--text-primary)] placeholder:text-[#333333] outline-none focus:bg-[color:var(--surface-muted)] focus:border-[color:var(--border-default)] hover:border-[color:var(--border-default)] transition-all"
            />
        </div>
    );
}

// ── Toggle ─────────────────────────────────────────────────────────────────

function ConfigToggle({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-sm text-[color:var(--text-secondary)]">{label}</p>
                {description && (
                    <p className="text-xs text-[color:var(--text-muted)] mt-0.5">{description}</p>
                )}
            </div>
            <button
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={clsx(
                    "relative w-9 h-5 rounded-full shrink-0 transition-colors duration-200 mt-0.5",
                    checked ? "bg-[#a78bfa]" : "bg-[#222222]"
                )}
            >
                <span
                    className={clsx(
                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200",
                        checked ? "translate-x-4" : "translate-x-0"
                    )}
                />
            </button>
        </div>
    );
}

// ── Options Editor (for dropdown / multi_select) ───────────────────────────

function OptionsEditor({
    options,
    onChange,
}: {
    options: FieldOption[];
    onChange: (opts: FieldOption[]) => void;
}) {
    const addOption = () => {
        onChange([
            ...options,
            { id: randomUUID(), label: `Option ${options.length + 1}` },
        ]);
    };

    const updateOption = (id: string, label: string) => {
        onChange(options.map((o) => (o.id === id ? { ...o, label } : o)));
    };

    const removeOption = (id: string) => {
        onChange(options.filter((o) => o.id !== id));
    };

    return (
        <div className="space-y-2">
            {options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                    <span className="text-xs text-[#333333] w-4 text-right shrink-0">
                        {i + 1}
                    </span>
                    <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => updateOption(opt.id, e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-sm bg-[color:var(--surface-solid)]/80 border border-[color:var(--border-subtle)] rounded-[10px] text-[color:var(--text-primary)] outline-none focus:bg-[color:var(--surface-muted)] focus:border-[color:var(--border-default)] hover:border-[color:var(--border-default)] transition-all"
                    />
                    <button
                        onClick={() => removeOption(opt.id)}
                        className="text-[#333333] hover:text-red-400 transition-colors"
                        aria-label="Remove option"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
            <button
                onClick={addOption}
                className="flex items-center gap-1.5 text-xs text-[#a78bfa] hover:text-[#c4b5fd] transition-colors mt-1"
            >
                <Plus size={12} />
                Add option
            </button>
        </div>
    );
}

// ── Star Rating Config ────────────────────────────────────────────────────

function StarRatingConfig({
    maxStars,
    onChange,
}: {
    maxStars: number;
    onChange: (n: number) => void;
}) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs text-[color:var(--text-secondary)]">Number of stars</label>
            <div className="flex gap-2">
                {[3, 4, 5, 7, 10].map((n) => (
                    <button
                        key={n}
                        onClick={() => onChange(n)}
                        className={clsx(
                            "w-9 h-9 rounded-lg text-sm font-medium transition-colors duration-150",
                            maxStars === n
                                ? "bg-[#a78bfa] text-[color:var(--text-primary)]"
                                : "bg-[color:var(--surface-solid)] text-[color:var(--text-secondary)] border border-[color:var(--border-default)] hover:border-[color:var(--border-strong)]"
                        )}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface FieldConfigPanelProps {
    field: FormField;
    onUpdate: (updates: Partial<FormField>) => void;
    onDelete: () => void;
}

export default function FieldConfigPanel({
    field,
    onUpdate,
    onDelete,
}: FieldConfigPanelProps) {
    return (
        <div className="p-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[color:var(--text-muted)] uppercase tracking-wider">
                    Field settings
                </p>
                <button
                    onClick={onDelete}
                    className="text-[color:var(--text-muted)] hover:text-red-400 transition-colors"
                    aria-label="Delete field"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Label */}
            <Section title="Label">
                <ConfigInput
                    label="Question label"
                    value={field.label}
                    onChange={(label) => onUpdate({ label })}
                    placeholder="Enter your question..."
                />
            </Section>

            {/* Placeholder (for text inputs) */}
            {(field.type === "short_text" ||
                field.type === "long_text" ||
                field.type === "url") && (
                    <Section title="Placeholder">
                        <ConfigInput
                            label="Placeholder text"
                            value={field.placeholder ?? ""}
                            onChange={(placeholder) => onUpdate({ placeholder })}
                            placeholder="e.g. Type your answer here..."
                        />
                    </Section>
                )}

            {/* Options (dropdown / multi_select) */}
            {(field.type === "dropdown" || field.type === "multi_select") &&
                field.options && (
                    <Section title="Options">
                        <OptionsEditor
                            options={field.options}
                            onChange={(options) => onUpdate({ options })}
                        />
                    </Section>
                )}

            {/* Star count */}
            {field.type === "star_rating" && (
                <Section title="Stars">
                    <StarRatingConfig
                        maxStars={field.maxStars ?? 5}
                        onChange={(maxStars) => onUpdate({ maxStars })}
                    />
                </Section>
            )}

            {/* File upload settings */}
            {(field.type === "file_upload" || field.type === "video_upload") && (
                <Section title="Upload settings">
                    <ConfigInput
                        label="Max file size (MB)"
                        value={String(field.maxFileSizeMB ?? 10)}
                        onChange={(v) => {
                            const n = parseInt(v, 10);
                            if (!isNaN(n) && n > 0) onUpdate({ maxFileSizeMB: n });
                        }}
                        placeholder="10"
                    />
                </Section>
            )}

            {/* Validation */}
            <Section title="Validation">
                <ConfigToggle
                    label="Required"
                    description="Respondents must answer this field"
                    checked={field.required}
                    onChange={(required) => onUpdate({ required })}
                />
            </Section>
        </div>
    );
}
