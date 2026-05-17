"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import type { FormConfig } from "@/types";
import { hasSeal } from "@/lib/contracts";
import { isValidSuiAddress, truncateAddress } from "@/lib/sui";

interface FormSettingsMenuProps {
    settings: FormConfig["settings"];
    onUpdate: (updates: Partial<FormConfig["settings"]>) => void;
    admins?: string[];
    onUpdateAdmins?: (admins: string[]) => void;
    ownerAddress?: string;
}

function Toggle({
    label,
    description,
    checked,
    onChange,
    icon,
    disabled = false,
    disabledHint,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    icon: string;
    disabled?: boolean;
    disabledHint?: string;
}) {
    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
            className={clsx(
                "w-full flex items-start gap-3 px-3 py-2.5 rounded-[12px] transition-colors duration-150 text-left group",
                disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-[color:var(--background-subtle)]",
            )}
        >
            <span className="mt-0.5 w-7 h-7 rounded-[8px] flex items-center justify-center bg-transparent border border-[color:var(--border-subtle)] shrink-0 group-hover:border-[#a78bfa]/30 transition-colors duration-150">
                <Icon icon={icon} className="w-3.5 h-3.5 text-[#a78bfa]" />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[color:var(--text-primary)] leading-tight">
                    {label}
                </span>
                <span className="block text-[11px] text-[color:var(--text-muted)] mt-0.5 leading-snug">
                    {disabled && disabledHint ? disabledHint : description}
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

export default function FormSettingsMenu({
    settings,
    onUpdate,
    admins,
    onUpdateAdmins,
    ownerAddress,
}: FormSettingsMenuProps) {
    const [open, setOpen] = useState(false);
    const [adminInput, setAdminInput] = useState("");
    const [adminError, setAdminError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const normalizedOwner = useMemo(
        () => (ownerAddress ? ownerAddress.toLowerCase() : ""),
        [ownerAddress],
    );
    const adminList = useMemo(() => admins ?? [], [admins]);

    const addAdmin = () => {
        const raw = adminInput.trim();
        if (!raw) return;
        if (!isValidSuiAddress(raw)) {
            setAdminError("Enter a full 0x-prefixed 32-byte Sui address.");
            return;
        }
        const lower = raw.toLowerCase();
        if (lower === normalizedOwner) {
            setAdminError("The owner is already an admin.");
            return;
        }
        if (adminList.includes(lower)) {
            setAdminError("This address is already a reviewer.");
            return;
        }
        onUpdateAdmins?.([...adminList, lower]);
        setAdminInput("");
        setAdminError(null);
    };

    const removeAdmin = (addr: string) => {
        onUpdateAdmins?.(adminList.filter((a) => a !== addr));
    };

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
                                checked={settings.isPrivate && hasSeal()}
                                onChange={(v) => onUpdate({ isPrivate: v })}
                                disabled={!hasSeal()}
                                disabledHint="Encrypted forms require Seal — not yet wired on this network."
                            />
                            <Toggle
                                icon="fluent:person-question-mark-24-regular"
                                label="Allow anonymous"
                                description="Respondents don't need a Sui wallet."
                                checked={settings.allowAnonymous}
                                onChange={(v) => onUpdate({ allowAnonymous: v })}
                            />
                        </div>
                        {onUpdateAdmins && (
                            <div className="px-4 pt-3 pb-3 border-t border-[color:var(--border-subtle)]">
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon
                                        icon="fluent:people-team-24-regular"
                                        className="w-3.5 h-3.5 text-[#a78bfa]"
                                    />
                                    <p className="text-[10px] font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.16em]">
                                        Reviewers
                                    </p>
                                </div>
                                <p className="text-[11px] text-[color:var(--text-muted)] leading-snug mb-2">
                                    Additional Sui addresses that can review responses for this form alongside the owner.
                                </p>
                                <div className="flex gap-1.5">
                                    <input
                                        type="text"
                                        value={adminInput}
                                        onChange={(e) => {
                                            setAdminInput(e.target.value);
                                            if (adminError) setAdminError(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addAdmin();
                                            }
                                        }}
                                        placeholder="0x…"
                                        spellCheck={false}
                                        autoComplete="off"
                                        className="flex-1 min-w-0 px-2 py-1.5 text-[12px] font-mono bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)] rounded-[10px] outline-none focus:border-[#a78bfa]/40 text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={addAdmin}
                                        className="shrink-0 px-2.5 py-1.5 text-[11px] font-medium rounded-[10px] bg-[#a78bfa]/10 border border-[#a78bfa]/25 text-[#a78bfa] hover:bg-[#a78bfa]/20 transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                                {adminError && (
                                    <p className="text-[11px] text-[color:var(--status-danger)] mt-1.5">
                                        {adminError}
                                    </p>
                                )}
                                {adminList.length > 0 && (
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {adminList.map((addr) => (
                                            <li
                                                key={addr}
                                                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-[10px] bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)]"
                                            >
                                                <span
                                                    className="text-[11px] font-mono text-[color:var(--text-secondary)]"
                                                    title={addr}
                                                >
                                                    {truncateAddress(addr)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAdmin(addr)}
                                                    aria-label={`Remove reviewer ${addr}`}
                                                    className="w-4 h-4 rounded-full flex items-center justify-center text-[color:var(--text-muted)] hover:text-[color:var(--status-danger)] hover:bg-[color:var(--status-danger-soft)] transition-colors"
                                                >
                                                    <Icon icon="fluent:dismiss-12-regular" className="w-2.5 h-2.5" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                        <div className="px-4 pt-3 pb-3 border-t border-[color:var(--border-subtle)]">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon
                                    icon="fluent:chat-multiple-24-regular"
                                    className="w-3.5 h-3.5 text-[#a78bfa]"
                                />
                                <p className="text-[10px] font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.16em]">
                                    After submit
                                </p>
                            </div>
                            <label className="block text-[11px] text-[color:var(--text-muted)] mb-1">
                                Thank-you message
                            </label>
                            <input
                                type="text"
                                value={settings.confirmationMessage ?? ""}
                                onChange={(e) =>
                                    onUpdate({ confirmationMessage: e.target.value })
                                }
                                placeholder="Your response is stored permanently on Walrus."
                                maxLength={200}
                                className="w-full px-2 py-1.5 text-[12px] bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)] rounded-[10px] outline-none focus:border-[#a78bfa]/40 text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
                            />
                            <label className="block text-[11px] text-[color:var(--text-muted)] mt-2.5 mb-1">
                                Creator note <span className="text-[color:var(--text-soft)]">(links auto-detected)</span>
                            </label>
                            <textarea
                                value={settings.postSubmitNote ?? ""}
                                onChange={(e) =>
                                    onUpdate({ postSubmitNote: e.target.value })
                                }
                                placeholder="e.g. Join our Discord: https://discord.gg/…"
                                maxLength={500}
                                rows={3}
                                className="w-full px-2 py-1.5 text-[12px] bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)] rounded-[10px] outline-none focus:border-[#a78bfa]/40 text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] resize-none"
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
