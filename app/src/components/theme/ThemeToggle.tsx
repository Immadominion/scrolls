"use client";

import { Icon } from "@iconify/react";
import clsx from "clsx";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle({ className }: { className?: string }) {
    const { mounted, theme, toggleTheme } = useTheme();

    if (!mounted) {
        return (
            <span
                aria-hidden="true"
                className={clsx(
                    "inline-flex min-h-10 min-w-10 rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)]",
                    className,
                )}
            />
        );
    }

    const nextTheme = theme === "dark" ? "light" : "dark";

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
            className={clsx(
                "inline-flex min-h-10 min-w-10 items-center justify-center rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--background-subtle)] text-[color:var(--text-secondary)] transition-colors duration-200 hover:border-[color:var(--border-default)] hover:bg-[color:var(--surface-panel)] hover:text-[color:var(--text-primary)]",
                className,
            )}
        >
            <Icon
                icon={theme === "dark" ? "fluent:weather-sunny-20-regular" : "fluent:weather-moon-20-regular"}
                className="h-4 w-4"
                aria-hidden="true"
            />
        </button>
    );
}