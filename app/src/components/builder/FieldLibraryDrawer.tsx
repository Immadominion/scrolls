"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import type { FieldType } from "@/types";
import FieldPalette from "./FieldPalette";
import clsx from "clsx";

interface FieldLibraryDrawerProps {
    open: boolean;
    isPinned: boolean;
    onClose: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onAddField: (type: FieldType) => void;
}

export default function FieldLibraryDrawer({
    open,
    isPinned,
    onClose,
    onMouseEnter,
    onMouseLeave,
    onAddField,
}: FieldLibraryDrawerProps) {
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.aside
                    key="library-drawer"
                    initial={{ x: -320, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -320, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    className="fixed top-20 left-4 bottom-8 w-80 bg-[color:var(--background-app)] z-50 flex flex-col border border-[color:var(--border-subtle)] rounded-[24px] overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between h-14 px-4 shrink-0 border-b border-[color:var(--border-subtle)]">
                        <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-[8px] border border-[color:var(--brand-primary-soft)] bg-[color:var(--brand-primary-soft)]">
                                <Icon icon="fluent:apps-list-24-regular" className="w-3.5 h-3.5 text-[#a78bfa]" />
                            </span>
                            <p className="text-sm font-semibold text-[color:var(--text-primary)] tracking-tight">
                                Field library
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className={clsx(
                                    "w-7 h-7 flex items-center justify-center rounded-lg transition-colors duration-150",
                                    isPinned ? "text-[#a78bfa] bg-[#a78bfa]/10" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-solid)]"
                                )}
                                aria-label={isPinned ? "Unpin library" : "Pin library"}
                            >
                                <Icon icon={isPinned ? "fluent:pin-24-filled" : "fluent:pin-24-regular"} className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-solid)] transition-colors duration-150"
                                aria-label="Close field library"
                            >
                                <Icon icon="fluent:dismiss-16-regular" className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto">
                        <FieldPalette
                            onAddField={(type) => {
                                onAddField(type);
                            }}
                        />
                    </div>

                    {/* Footer hint */}
                    <div className="px-4 py-3 text-[11px] text-[color:var(--text-muted)] border-t border-[color:var(--border-subtle)] shrink-0 flex items-center justify-between">
                        <span>Click to add to your form</span>
                        <span className="font-mono text-[color:var(--text-muted)]">esc</span>
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}
