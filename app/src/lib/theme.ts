export type ScrollsTheme = "dark" | "light";

export const SCROLLS_THEME_STORAGE_KEY = "scrolls:theme";

export function isScrollsTheme(value: unknown): value is ScrollsTheme {
    return value === "dark" || value === "light";
}

export function getSystemTheme(): ScrollsTheme {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
    }

    return "dark";
}

export function resolveTheme(value?: string | null): ScrollsTheme {
    return isScrollsTheme(value) ? value : getSystemTheme();
}

export function applyTheme(theme: ScrollsTheme) {
    if (typeof document === "undefined") {
        return;
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
}

export const themeInitScript = `(() => {
    try {
        const key = "${SCROLLS_THEME_STORAGE_KEY}";
        const stored = window.localStorage.getItem(key);
        const theme = stored === "light" || stored === "dark"
            ? stored
            : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
    } catch {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.style.colorScheme = "dark";
    }
})();`;