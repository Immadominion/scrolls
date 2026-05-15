"use client";

import clsx from "clsx";
import { useTheme } from "@/components/theme/ThemeProvider";

interface ScrollsLogoProps {
    className?: string;
    alt?: string;
    decorative?: boolean;
}

export default function ScrollsLogo({
    className,
    alt = "Scrolls",
    decorative = false,
}: ScrollsLogoProps) {
    const { mounted, theme } = useTheme();
    const darkMode = !mounted || theme === "dark";

    return (
        <img
            src="/logo.png"
            alt={decorative ? "" : alt}
            aria-hidden={decorative || undefined}
            className={clsx(
                "select-none object-contain",
                darkMode
                    ? "invert brightness-[1.45] contrast-[1.08] drop-shadow-[0_0_10px_rgba(255,255,255,0.08)]"
                    : "brightness-100 contrast-100",
                className,
            )}
        />
    );
}