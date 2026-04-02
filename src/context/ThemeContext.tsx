"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Marketing home must stay visually light; only the pre-reg overlay is dark. Ignore stored dark mode on `/` for `html.dark`. */
function applyRootDarkClass(theme: Theme, pathname: string) {
  if (typeof document === "undefined") return;
  if (pathname === "/") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("bizzi-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyRootDarkClass(theme, pathname);
  }, [mounted, pathname, theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("bizzi-theme", newTheme);
      applyRootDarkClass(newTheme, window.location.pathname);
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  const contextValue: ThemeContextType = {
    theme,
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Theme for UI rendered outside the React tree (e.g. some portaled previews).
 * Prefers context; after mount, falls back to `document.documentElement` `.dark` class.
 */
export function useThemeResolved(): Theme {
  const ctx = useContext(ThemeContext);
  const [domFallback, setDomFallback] = useState<Theme>("light");

  useEffect(() => {
    if (ctx !== undefined) return;
    setDomFallback(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, [ctx]);

  return ctx?.theme ?? domFallback;
}
