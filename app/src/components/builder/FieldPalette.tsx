"use client";

import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import {
    AlignLeft,
    CheckSquare,
    ChevronDown,
    FileText,
    FileUp,
    Link2,
    List,
    Star,
    Type,
    Video,
    type LucideIcon,
} from "lucide-react";
import type { FieldType } from "@/types";

// ── Field type definitions ─────────────────────────────────────────────────

interface PaletteItem {
    type: FieldType;
    label: string;
    icon: LucideIcon;
    description: string;
}

const PALETTE_GROUPS: { group: string; items: PaletteItem[] }[] = [
    {
        group: "Text",
        items: [
            { type: "short_text", label: "Short answer", icon: Type, description: "Single line" },
            { type: "long_text", label: "Long answer", icon: AlignLeft, description: "Multi-line" },
            { type: "rich_text", label: "Rich text", icon: FileText, description: "Formatted" },
            { type: "url", label: "URL", icon: Link2, description: "Link or website" },
        ],
    },
    {
        group: "Choice",
        items: [
            { type: "dropdown", label: "Dropdown", icon: ChevronDown, description: "Select one" },
            { type: "multi_select", label: "Multi-select", icon: List, description: "Select many" },
            { type: "confirm_checkbox", label: "Checkbox", icon: CheckSquare, description: "Agree / confirm" },
        ],
    },
    {
        group: "Rating",
        items: [
            { type: "star_rating", label: "Star rating", icon: Star, description: "1–5 stars" },
        ],
    },
    {
        group: "Upload",
        items: [
            { type: "file_upload", label: "File", icon: FileUp, description: "Any file type" },
            { type: "video_upload", label: "Video", icon: Video, description: "MP4 / MOV / WebM" },
        ],
    },
];

// ── Component ──────────────────────────────────────────────────────────────

interface FieldPaletteProps {
    onAddField: (type: FieldType) => void;
}

const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.4, 0.25, 1] as const } },
};

export default function FieldPalette({ onAddField }: FieldPaletteProps) {
    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="p-4 space-y-5"
        >
            <motion.div variants={itemVariants} className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[color:var(--text-secondary)] uppercase tracking-[0.12em]">
                    Field palette
                </p>
                <span className="text-[10px] text-[color:var(--text-muted)] font-mono">10</span>
            </motion.div>

            {PALETTE_GROUPS.map(({ group, items }) => (
                <motion.div key={group} variants={itemVariants} className="space-y-1">
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                        <p className="text-[10px] text-[color:var(--text-muted)] uppercase tracking-wider font-semibold">
                            {group}
                        </p>
                        <span className="flex-1 h-px bg-gradient-to-r from-[#1a1a1a] via-[#1a1a1a] to-transparent" />
                    </div>
                    {items.map((item) => (
                        <PaletteButton
                            key={item.type}
                            item={item}
                            onClick={() => onAddField(item.type)}
                        />
                    ))}
                </motion.div>
            ))}

            {/* Footer hint */}
            <motion.div
                variants={itemVariants}
                className="pt-3 mt-2 border-t border-[color:var(--border-subtle)] text-[11px] text-[color:var(--text-muted)] leading-relaxed px-1"
            >
                Click to add — drag handles in the canvas to reorder.
            </motion.div>
        </motion.div>
    );
}

function PaletteButton({
    item,
    onClick,
}: {
    item: PaletteItem;
    onClick: () => void;
}) {
    const FieldIcon = item.icon;

    return (
        <motion.button
            onClick={onClick}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
            className={clsx(
                "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left",
                "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-solid)]",
                "transition-colors duration-150 group/item"
            )}
        >
            <span className="relative w-8 h-8 flex items-center justify-center rounded-md border border-transparent group-hover/item:border-[#a78bfa]/30 group-hover/item:bg-[color:var(--brand-primary-soft)] transition-all duration-200 shrink-0">
                <FieldIcon className="h-4 w-4 text-[color:var(--brand-primary)]" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-tight truncate">
                    {item.label}
                </span>
                <span className="block text-[11px] text-[color:var(--text-muted)] leading-tight mt-0.5">
                    {item.description}
                </span>
            </span>
            <Icon
                icon="fluent:add-12-regular"
                className="w-3.5 h-3.5 text-[#333333] opacity-0 group-hover/item:opacity-100 group-hover/item:text-[#a78bfa] transition-all duration-150 shrink-0"
            />
        </motion.button>
    );
}
