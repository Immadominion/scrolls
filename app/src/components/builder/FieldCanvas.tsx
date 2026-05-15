"use client";

import { useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { Trash2, GripVertical } from "lucide-react";
import clsx from "clsx";
import type { FormConfig, FormField, FieldType } from "@/types";

// ── Field type display metadata ────────────────────────────────────────────

const FIELD_ICONS: Record<FieldType, string> = {
    short_text: "fluent:text-field-24-regular",
    long_text: "fluent:text-paragraph-24-regular",
    rich_text: "fluent:text-edit-style-24-regular",
    dropdown: "fluent:chevron-circle-down-24-regular",
    multi_select: "fluent:checkbox-multiple-24-regular",
    star_rating: "fluent:star-24-regular",
    file_upload: "fluent:document-arrow-up-24-regular",
    video_upload: "fluent:video-clip-24-regular",
    url: "fluent:link-24-regular",
    confirm_checkbox: "fluent:checkbox-checked-24-regular",
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
    short_text: "Short text",
    long_text: "Long text",
    rich_text: "Rich text",
    dropdown: "Dropdown",
    multi_select: "Multi-select",
    star_rating: "Rating",
    file_upload: "File",
    video_upload: "Video",
    url: "URL",
    confirm_checkbox: "Checkbox",
};

// ── Sortable Field Item ────────────────────────────────────────────────────

interface SortableFieldProps {
    field: FormField;
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
}

function SortableField({ field, isSelected, onSelect, onDelete }: SortableFieldProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: field.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.25, 0.4, 0.25, 1] }}
            onClick={onSelect}
            className={clsx(
                "group relative rounded-xl cursor-pointer transition-colors duration-150",
                isDragging && "z-10 shadow-2xl shadow-black/50"
            )}
        >
            {/* Outer gradient border (selected) — uses padding trick */}
            <div
                className={clsx(
                    "absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200",
                    isSelected ? "opacity-100" : "opacity-0"
                )}
                style={{
                    background:
                        "linear-gradient(135deg, rgba(167, 139, 250, 0.55) 0%, rgba(6, 182, 212, 0.35) 50%, rgba(167, 139, 250, 0.4) 100%)",
                    padding: "1px",
                    WebkitMask:
                        "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                }}
                aria-hidden="true"
            />

            {/* Glow on selected */}
            {isSelected && (
                <div
                    className="absolute -inset-px rounded-xl pointer-events-none opacity-50"
                    aria-hidden="true"
                    style={{
                        background:
                            "radial-gradient(ellipse 70% 60% at 0% 50%, rgba(167, 139, 250, 0.12) 0%, transparent 70%)",
                    }}
                />
            )}

            <div
                className={clsx(
                    "relative flex items-start gap-3 p-4 rounded-xl border",
                    isSelected
                        ? "border-transparent bg-[#0f0d18]"
                        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-solid)] hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-solid)]"
                )}
            >
                {/* Drag handle */}
                <button
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 text-[#2a2a2a] hover:text-[#666666] transition-colors cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100"
                    aria-label="Drag to reorder"
                >
                    <GripVertical size={16} />
                </button>

                {/* Field icon */}
                <span
                    className={clsx(
                        "mt-0.5 w-7 h-7 flex items-center justify-center rounded-md shrink-0 transition-colors duration-200",
                        isSelected
                            ? "bg-gradient-to-br from-[#a78bfa]/20 to-[#06b6d4]/10 border border-[#a78bfa]/30"
                            : "bg-[color:var(--background-app)] border border-[color:var(--border-subtle)]"
                    )}
                >
                    <Icon
                        icon={FIELD_ICONS[field.type]}
                        className={clsx(
                            "w-3.5 h-3.5",
                            isSelected ? "text-[#a78bfa]" : "text-[color:var(--text-muted)]"
                        )}
                    />
                </span>

                {/* Label + meta */}
                <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">
                            {field.label}
                        </p>
                        {field.required && (
                            <span className="text-[10px] font-semibold text-[#a78bfa] bg-[#a78bfa]/10 border border-[#a78bfa]/20 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                Required
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[color:var(--text-muted)] mt-1 flex items-center gap-1.5">
                        <span>{FIELD_TYPE_LABELS[field.type]}</span>
                        {field.placeholder && (
                            <>
                                <span className="text-[#222222]">·</span>
                                <span className="truncate">{field.placeholder}</span>
                            </>
                        )}
                    </p>
                </div>

                {/* Delete */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="opacity-0 group-hover:opacity-100 mt-0.5 text-[color:var(--text-muted)] hover:text-red-400 transition-all duration-150 shrink-0 p-1 -m-1"
                    aria-label="Delete field"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </motion.div>
    );
}

// ── Empty Canvas State ─────────────────────────────────────────────────────

function EmptyCanvas({ onAddField }: { onAddField: (type: FieldType) => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
            className="flex flex-col items-center justify-center py-20 text-center"
        >
            {/* Animated orb */}
            <div className="relative w-20 h-20 mb-7">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-2xl"
                    style={{
                        background:
                            "conic-gradient(from 0deg, rgba(167, 139, 250, 0.4), rgba(6, 182, 212, 0.3), rgba(167, 139, 250, 0.4))",
                        filter: "blur(20px)",
                        opacity: 0.6,
                    }}
                />
                <div className="absolute inset-0 rounded-2xl bg-[color:var(--surface-solid)] border border-[color:var(--border-subtle)] flex items-center justify-center backdrop-blur-sm">
                    <motion.div
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <Icon
                            icon="fluent:form-multiple-48-regular"
                            className="w-9 h-9 text-[#a78bfa]"
                        />
                    </motion.div>
                </div>
            </div>

            <p className="text-base font-display font-semibold text-[color:var(--text-primary)] mb-2 tracking-tight">
                Describe your form below
            </p>
            <p className="text-sm text-[color:var(--text-muted)] max-w-sm leading-relaxed">
                Type a prompt, attach context, or talk to the AI in the dock at the bottom.
                Or open the field library to build manually.
            </p>

            <div className="flex items-center gap-2 mt-6 flex-wrap justify-center">
                <QuickStart icon="fluent:text-field-24-regular" label="Short answer" onClick={() => onAddField("short_text")} />
                <QuickStart icon="fluent:text-paragraph-24-regular" label="Long answer" onClick={() => onAddField("long_text")} />
                <QuickStart icon="fluent:star-24-regular" label="Rating" onClick={() => onAddField("star_rating")} />
            </div>
        </motion.div>
    );
}

function QuickStart({
    icon,
    label,
    onClick,
}: {
    icon: string;
    label: string;
    onClick: () => void;
}) {
    return (
        <motion.button
            onClick={onClick}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-[color:var(--border-subtle)] hover:border-[#a78bfa]/30 rounded-lg bg-[color:var(--surface-solid)]/50 backdrop-blur-sm transition-colors duration-150"
        >
            <Icon icon={icon} className="w-3.5 h-3.5 text-[#a78bfa]" />
            {label}
        </motion.button>
    );
}

// ── Main FieldCanvas ───────────────────────────────────────────────────────

interface FieldCanvasProps {
    formConfig: FormConfig;
    selectedFieldId: string | null;
    onSelectField: (id: string | null) => void;
    onDeleteField: (id: string) => void;
    onReorderFields: (orderedIds: string[]) => void;
    onUpdateTitle: (title: string) => void;
    onUpdateDescription: (description: string) => void;
    onAddField: (type: FieldType) => void;
}

export default function FieldCanvas({
    formConfig,
    selectedFieldId,
    onSelectField,
    onDeleteField,
    onReorderFields,
    onUpdateTitle,
    onUpdateDescription,
    onAddField,
}: FieldCanvasProps) {
    const [titleFocused, setTitleFocused] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = formConfig.fields.findIndex((f) => f.id === active.id);
            const newIndex = formConfig.fields.findIndex((f) => f.id === over.id);
            const reordered = arrayMove(formConfig.fields, oldIndex, newIndex);
            onReorderFields(reordered.map((f) => f.id));
        }
    }

    return (
        <div
            className="relative max-w-2xl mx-auto px-6 py-10"
            onClick={(e) => {
                if (e.target === e.currentTarget) onSelectField(null);
            }}
        >
            {/* Form title & description */}
            <div className="mb-8">
                <input
                    type="text"
                    value={formConfig.title}
                    onChange={(e) => onUpdateTitle(e.target.value)}
                    onFocus={() => setTitleFocused(true)}
                    onBlur={() => setTitleFocused(false)}
                    placeholder="Untitled form"
                    className={clsx(
                        "w-full text-3xl font-display font-bold bg-transparent text-[color:var(--text-primary)] outline-none tracking-tight",
                        "placeholder:text-[#2a2a2a]",
                        "border-b pb-2 transition-colors duration-200",
                        titleFocused ? "border-[#a78bfa]/40" : "border-transparent hover:border-[color:var(--border-subtle)]"
                    )}
                />
                <textarea
                    value={formConfig.description ?? ""}
                    onChange={(e) => onUpdateDescription(e.target.value)}
                    placeholder="Add a description (optional)"
                    rows={2}
                    className="w-full mt-3 text-sm bg-transparent text-[color:var(--text-secondary)] outline-none resize-none placeholder:text-[#2a2a2a] leading-relaxed"
                />
            </div>

            {/* Field list */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={formConfig.fields.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        <AnimatePresence>
                            {formConfig.fields.map((field) => (
                                <SortableField
                                    key={field.id}
                                    field={field}
                                    isSelected={field.id === selectedFieldId}
                                    onSelect={() => onSelectField(field.id)}
                                    onDelete={() => onDeleteField(field.id)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </SortableContext>
            </DndContext>

            {/* Empty state */}
            {formConfig.fields.length === 0 && (
                <EmptyCanvas onAddField={onAddField} />
            )}
        </div>
    );
}
