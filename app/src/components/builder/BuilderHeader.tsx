"use client";

import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import ScrollsLogo from "@/components/brand/ScrollsLogo";
import type { FormConfig } from "@/types";
import ThemeToggle from "@/components/theme/ThemeToggle";
import FormSettingsMenu from "./FormSettingsMenu";

interface BuilderHeaderProps {
    formTitle: string;
    onTitleChange: (title: string) => void;
    isPreview: boolean;
    onPreviewToggle: () => void;
    onPublish: () => void;
    isPublishing: boolean;
    fieldCount: number;
    onOpenLibrary: () => void;
    settings: FormConfig["settings"];
    onUpdateSettings: (updates: Partial<FormConfig["settings"]>) => void;
    admins?: string[];
    onUpdateAdmins?: (admins: string[]) => void;
    ownerAddress?: string;
}

export default function BuilderHeader({
    formTitle,
    onTitleChange,
    isPreview,
    onPreviewToggle,
    onPublish,
    isPublishing,
    fieldCount,
    onOpenLibrary,
    settings,
    onUpdateSettings,
    admins,
    onUpdateAdmins,
    ownerAddress,
}: BuilderHeaderProps) {
    return (
        <header className="relative h-14 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0 bg-[color:var(--background-app)] z-30">
            {/* Logo */}
            <a
                href="/"
                className="group flex items-center gap-1.5 sm:gap-2 text-[color:var(--text-primary)] shrink-0"
                aria-label="Scrolls home"
            >
                <ScrollsLogo
                    decorative
                    className="h-7 w-7 transition-transform duration-300 group-hover:rotate-[8deg]"
                />
                <span className="font-display font-semibold text-sm tracking-tight hidden sm:block">
                    Scrolls
                </span>
            </a>

            <span className="text-[color:var(--text-muted)] text-base select-none" aria-hidden="true">
                /
            </span>

            {/* Dashboard breadcrumb */}
            <a
                href="/dashboard"
                className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors duration-150 shrink-0 hidden sm:block"
            >
                Dashboard
            </a>

            <span className="text-[color:var(--text-muted)] text-base select-none hidden sm:block" aria-hidden="true">
                /
            </span>

            {/* Form title — inline editable */}
            <div className="relative flex items-center">
                <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                    onFocus={(e) => {
                        if (e.target.value === "Untitled form") e.target.select();
                    }}
                    placeholder="Untitled form"
                    className="text-sm text-[color:var(--text-primary)] truncate w-28 sm:w-40 hover:w-44 sm:hover:w-56 focus:w-44 sm:focus:w-64 font-medium bg-transparent border-0 outline-none placeholder:text-[color:var(--text-muted)] transition-all duration-300 ease-out rounded-[10px] px-2 py-1.5 hover:bg-[color:var(--background-subtle)] focus:bg-[color:var(--background-subtle)] focus-visible:outline-none"
                    aria-label="Form title"
                />
            </div>

            <div className="hidden sm:flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--background-subtle)] border border-[color:var(--border-subtle)] text-[11px] text-[color:var(--text-secondary)] font-medium">
                    <span className="relative flex w-1.5 h-1.5">
                        <span className="absolute inset-0 rounded-full bg-[#a78bfa] animate-ping opacity-40" />
                        <span className="relative rounded-full w-1.5 h-1.5 bg-[#a78bfa]" />
                    </span>
                    Draft
                </div>
                {fieldCount > 0 && (
                    <span className="text-xs text-[color:var(--text-muted)] tabular-nums">
                        {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            <div className="flex-1" />

            <ThemeToggle />

            <div className="flex items-center gap-2 shrink-0">
                {/* Library button — hidden during preview */}
                {!isPreview && (
                    <motion.button
                        type="button"
                        onClick={onOpenLibrary}
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.1 }}
                        className="min-h-10 flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] text-sm font-medium bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)] transition-colors duration-200 shrink-0"
                        aria-label="Open field library"
                    >
                        <Icon icon="fluent:apps-add-in-24-regular" className="w-4 h-4" />
                        <span className="hidden sm:inline">Library</span>
                    </motion.button>
                )}

                {/* Preview toggle */}
                <motion.button
                    type="button"
                    onClick={onPreviewToggle}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.1 }}
                    className={clsx(
                        "min-h-10 flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] text-sm font-medium transition-colors duration-200 shrink-0",
                        isPreview
                            ? "bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)]"
                            : "bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--background-subtle)] hover:text-[color:var(--text-primary)]"
                    )}
                    aria-label={isPreview ? "Return to editing" : "Preview form"}
                >
                    {isPreview ? (
                        <>
                            <Icon icon="fluent:document-edit-24-regular" className="w-4 h-4" />
                            Edit
                        </>
                    ) : (
                        <>
                            <Icon icon="fluent:eye-24-regular" className="w-4 h-4" />
                            <span className="hidden sm:inline">Preview</span>
                        </>
                    )}
                </motion.button>

                {/* Publish button — preview only */}
                {isPreview && (
                    <motion.button
                        type="button"
                        onClick={onPublish}
                        disabled={isPublishing || fieldCount === 0}
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.1 }}
                        className={clsx(
                            "relative min-h-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-sm font-semibold transition-colors duration-200 shrink-0 overflow-hidden",
                            fieldCount === 0
                                ? "bg-[color:var(--background-subtle)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)] cursor-not-allowed"
                                : "bg-[color:var(--brand-primary)] text-[color:var(--text-inverse)] hover:bg-[color:var(--brand-primary-hover)]"
                        )}
                    >
                        {isPublishing ? (
                            <>
                                <Icon icon="fluent:spinner-ios-20-regular" className="w-4 h-4 animate-spin" />
                                <span className="hidden sm:inline">Publishing…</span>
                            </>
                        ) : (
                            <>
                                <Icon icon="fluent:cloud-arrow-up-24-filled" className="w-4 h-4" />
                                Publish
                            </>
                        )}
                    </motion.button>
                )}
            </div>

            {/* Settings menu — pinned to the far edge while editing */}
            {!isPreview && (
                <div className="shrink-0">
                    <FormSettingsMenu
                        settings={settings}
                        onUpdate={onUpdateSettings}
                        admins={admins}
                        onUpdateAdmins={onUpdateAdmins}
                        ownerAddress={ownerAddress}
                    />
                </div>
            )}

            {/* Gradient bottom border */}
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
                aria-hidden="true"
                style={{
                    background:
                        "linear-gradient(90deg, transparent 0%, rgba(167, 139, 250, 0.28) 50%, transparent 100%)",
                }}
            />
        </header>
    );
}
