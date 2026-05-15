"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import type { FormConfig } from "@/types";

interface FormSettingsMenuProps {
    settings: FormConfig["settings"];
    onUpdate: (updates: Partial<FormConfig["settings"]>) => void;
}

function Toggle({
    label,
    description,
    checked,
    onChange,
    icon,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    icon: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[color:var(--background-subtle)] transition-colors duration-150 text-left group"
        >
            <span className="mt-0.5 w-7 h-7 rounded-[8px] flex items-center justify-center bg-transparent border border-[color:var(--border-subtle)] shrink-0 group-hover:border-[#a78bfa]/30 transition-colors duration-150">
                <Icon icon={icon} className="w-3.5 h-3.5 text-[#a78bfa]" />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[color:var(--text-primary)] leading-tight">
                    {label}
                </span>
                <span className="block text-[11px] text-[color:var(--text-muted)] mt-0.5 leading-snug">
                    {description}
                </span>
            </span>
            <span
                className={clsx(
                    "relative w-8 h-[18px] rounded-full shrink-0 mt-1 transition-colors duration-200",
                    checked ? "bg-[#a78bfa]" : "bg-[color:var(--border-strong)]"
                )}
            >
                <span
                    className={clsx(
                        "absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full bg-white transition-transform duration-200",
                        checked ? "translate-x-[14px]" : "translate-x-0"
                    )}
                />
            </span>
        </button>
    );
}

export default function FormSettingsMenu({ settings, onUpdate }: FormSettingsMenuProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("mousedown", handler);
        window.addEventListener("keydown", escHandler);
        return () => {
            window.removeEventListener("mousedown", handler);
            window.removeEventListener("keydown", escHandler);
        };
    }, [open]);

    return (
        <div ref={containerRef} className="relative shrink-0">
            <motion.button
                type="button"
                onClick={() => setOpen((p) => !p)}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.1 }}
                className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-sm font-medium transition-colors duration-200",
                    open
                        ? "bg-[color:var(--surface-panel)] text-[color:var(--text-primary)]"
                        : "bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)]"
                )}
                aria-label="Form settings"
            >
                <Icon icon="fluent:settings-24-regular" className="w-4 h-4" />
                {settings.isPrivate && (
                    <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a78bfa]">
                        <Icon icon="fluent:lock-closed-16-filled" className="w-3 h-3" />
                        Private
                    </span>
                )}
            </motion.button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
                        className="absolute right-0 top-full mt-2 w-80 rounded-[20px] bg-[color:var(--surface-panel-strong)] border border-[color:var(--border-subtle)] shadow-[var(--shadow-panel)] z-50 overflow-hidden"
                    >
                        <div className="px-3 pt-3 pb-1.5">
                            <p className="text-[10px] font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.16em] px-1">
                                Form settings
                            </p>
                        </div>
                        <div className="px-1.5 pb-2">
                            <Toggle
                                icon="fluent:lock-closed-24-regular"
                                label="Private responses"
                                description="Encrypt submissions end-to-end. Only you can read them."
                                checked={settings.isPrivate}
                                onChange={(v) => onUpdate({ isPrivate: v })}
                            />
                            <Toggle
                                icon="fluent:person-question-mark-24-regular"
                                label="Allow anonymous"
                                description="Respondents don't need a Sui wallet."
                                checked={settings.allowAnonymous}
                                onChange={(v) => onUpdate({ allowAnonymous: v })}
                            />
                        </div>
                        <div className="px-4 py-2.5 text-[11px] text-[color:var(--text-muted)] border-t border-[color:var(--border-subtle)] flex items-center gap-1.5">
                            <Icon icon="fluent:cloud-24-regular" className="w-3.5 h-3.5 text-[color:var(--text-soft)]" />
                            All responses store permanently on Walrus.
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
