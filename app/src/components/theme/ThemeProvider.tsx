"use client";

import {
    createContext,
    startTransition,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import {
    SCROLLS_THEME_STORAGE_KEY,
    applyTheme,
    getSystemTheme,
    isScrollsTheme,
    resolveTheme,
    type ScrollsTheme,
} from "@/lib/theme";

interface ThemeContextValue {
    theme: ScrollsTheme;
    mounted: boolean;
    setTheme: (theme: ScrollsTheme) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export default function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ScrollsTheme>("dark");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const storedTheme = window.localStorage.getItem(SCROLLS_THEME_STORAGE_KEY);
        const nextTheme = resolveTheme(storedTheme);

        applyTheme(nextTheme);
        setThemeState(nextTheme);
        setMounted(true);

        const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
        const handleSystemThemeChange = () => {
            const currentPreference = window.localStorage.getItem(SCROLLS_THEME_STORAGE_KEY);
            if (isScrollsTheme(currentPreference)) {
                return;
            }

            const systemTheme = getSystemTheme();
            applyTheme(systemTheme);
            setThemeState(systemTheme);
        };

        mediaQuery.addEventListener("change", handleSystemThemeChange);

        return () => {
            mediaQuery.removeEventListener("change", handleSystemThemeChange);
        };
    }, []);

    const setTheme = (nextTheme: ScrollsTheme) => {
        applyTheme(nextTheme);
        window.localStorage.setItem(SCROLLS_THEME_STORAGE_KEY, nextTheme);
        startTransition(() => {
            setThemeState(nextTheme);
        });
    };

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    return (
        <ThemeContext.Provider value={{ theme, mounted, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider.");
    }

    return context;
}