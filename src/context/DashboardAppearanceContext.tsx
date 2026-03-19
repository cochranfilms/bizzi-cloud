"use client";

import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getDashboardBackground } from "@/lib/dashboard-appearance-themes";

const STORAGE_ACCENT = "bizzi-dashboard-accent";
const STORAGE_BACKGROUND = "bizzi-dashboard-background";
const DEFAULT_ACCENT = "#00BFFF";
const DEFAULT_ACCENT_HOVER = "#00D4FF";

interface DashboardAppearanceContextType {
  accentColor: string;
  setAccentColor: (hex: string) => void;
  backgroundThemeId: string | null;
  setBackgroundThemeId: (id: string | null) => void;
  cssVariables: React.CSSProperties;
  resetToDefault: () => void;
}

const DashboardAppearanceContext = createContext<DashboardAppearanceContextType | undefined>(
  undefined
);

function lightenHex(hex: string, amount: number): string {
  const parsed = hex.replace(/^#/, "");
  const r = Math.min(255, parseInt(parsed.slice(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(parsed.slice(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(parsed.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function DashboardAppearanceProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [accentColor, setAccentColorState] = useState<string>(DEFAULT_ACCENT);
  const [backgroundThemeId, setBackgroundThemeIdState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const storedAccent = localStorage.getItem(STORAGE_ACCENT);
    const storedBg = localStorage.getItem(STORAGE_BACKGROUND);
    if (storedAccent && /^#[0-9A-Fa-f]{6}$/.test(storedAccent)) {
      setAccentColorState(storedAccent);
    }
    if (storedBg) {
      setBackgroundThemeIdState(storedBg);
    }
  }, []);

  const setAccentColor = (hex: string) => {
    setAccentColorState(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex) && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_ACCENT, hex);
    }
  };

  const setBackgroundThemeId = (id: string | null) => {
    setBackgroundThemeIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem(STORAGE_BACKGROUND, id);
      } else {
        localStorage.removeItem(STORAGE_BACKGROUND);
      }
    }
  };

  const resetToDefault = () => {
    setAccentColorState(DEFAULT_ACCENT);
    setBackgroundThemeIdState(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_ACCENT);
      localStorage.removeItem(STORAGE_BACKGROUND);
    }
  };

  const isDark = theme === "dark";
  const dashboardBg = getDashboardBackground(backgroundThemeId, isDark);
  const accentHover = useMemo(
    () => lightenHex(accentColor, 20),
    [accentColor]
  );

  const sectionTitleBg = useMemo(() => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(accentColor)) return "rgba(0, 191, 255, 0.2)";
    const parsed = accentColor.replace(/^#/, "");
    const r = parseInt(parsed.slice(0, 2), 16);
    const g = parseInt(parsed.slice(2, 4), 16);
    const b = parseInt(parsed.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.2)`;
  }, [accentColor]);

  const cssVariables: React.CSSProperties = useMemo(() => {
    const vars: Record<string, string> = {
      "--bizzi-accent": accentColor,
      "--bizzi-accent-hover": accentHover,
      "--bizzi-section-title-bg": sectionTitleBg,
    };
    if (dashboardBg) {
      vars["--dashboard-bg"] = dashboardBg;
      vars["backgroundColor"] = dashboardBg;
    }
    return vars as React.CSSProperties;
  }, [accentColor, accentHover, dashboardBg, sectionTitleBg]);

  const contextValue: DashboardAppearanceContextType = useMemo(
    () => ({
      accentColor,
      setAccentColor,
      backgroundThemeId,
      setBackgroundThemeId,
      cssVariables,
      resetToDefault,
    }),
    [
      accentColor,
      backgroundThemeId,
      cssVariables,
    ]
  );

  return (
    <DashboardAppearanceContext.Provider value={contextValue}>
      {children}
    </DashboardAppearanceContext.Provider>
  );
}

export function useDashboardAppearance() {
  const context = useContext(DashboardAppearanceContext);
  if (context === undefined) {
    throw new Error("useDashboardAppearance must be used within a DashboardAppearanceProvider");
  }
  return context;
}
