"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getDashboardBackground } from "@/lib/dashboard-appearance-themes";
import type { EnterpriseThemeId } from "@/types/enterprise";
import {
  deleteWorkspaceAppearance,
  getDashboardWorkspaceKey,
  migrateLegacyDashboardAppearanceKeys,
  readAllWorkspaceAppearance,
  removeLegacyGlobalAppearanceKeys,
  writeWorkspaceAppearance,
} from "@/lib/dashboard-workspace-appearance-storage";

const DEFAULT_ACCENT = "#00BFFF";

interface DashboardAppearanceContextType {
  accentColor: string;
  setAccentColor: (hex: string) => void;
  backgroundThemeId: string | null;
  setBackgroundThemeId: (id: string | null) => void;
  /** Local theme override (Bizzi, Rose, …). Null = inherit org/team default or Bizzi for personal. */
  uiThemeOverride: EnterpriseThemeId | null;
  setUiThemeId: (id: EnterpriseThemeId | null) => void;
  workspaceKey: string;
  cssVariables: React.CSSProperties;
  resetToDefault: () => void;
}

const DashboardAppearanceContext = createContext<
  DashboardAppearanceContextType | undefined
>(undefined);

function lightenHex(hex: string, amount: number): string {
  const parsed = hex.replace(/^#/, "");
  const r = Math.min(255, parseInt(parsed.slice(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(parsed.slice(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(parsed.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function DashboardAppearanceProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const pathname = usePathname();
  const { org } = useEnterprise();
  const enterpriseOrgId = org?.id ?? null;

  const workspaceKey = useMemo(
    () => getDashboardWorkspaceKey(pathname, enterpriseOrgId),
    [pathname, enterpriseOrgId],
  );

  const [accentColor, setAccentColorState] = useState<string>(DEFAULT_ACCENT);
  const [backgroundThemeId, setBackgroundThemeIdState] = useState<string | null>(null);
  const [uiThemeOverride, setUiThemeOverrideState] =
    useState<EnterpriseThemeId | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    migrateLegacyDashboardAppearanceKeys();
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    if (workspaceKey === "enterprise:pending") {
      setAccentColorState(DEFAULT_ACCENT);
      setBackgroundThemeIdState(null);
      setUiThemeOverrideState(null);
      return;
    }
    const slot = readAllWorkspaceAppearance()[workspaceKey] ?? {};
    setAccentColorState(
      slot.accent && /^#[0-9A-Fa-f]{6}$/.test(slot.accent) ? slot.accent : DEFAULT_ACCENT,
    );
    setBackgroundThemeIdState(
      slot.background !== undefined ? slot.background : null,
    );
    setUiThemeOverrideState(
      slot.uiTheme !== undefined ? slot.uiTheme : null,
    );
  }, [workspaceKey, hydrated]);

  const setAccentColor = useCallback(
    (hex: string) => {
      setAccentColorState(hex);
      if (workspaceKey === "enterprise:pending") return;
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      if (typeof window === "undefined") return;
      writeWorkspaceAppearance(workspaceKey, { accent: hex });
    },
    [workspaceKey],
  );

  const setBackgroundThemeId = useCallback(
    (id: string | null) => {
      setBackgroundThemeIdState(id);
      if (workspaceKey === "enterprise:pending") return;
      if (typeof window === "undefined") return;
      writeWorkspaceAppearance(workspaceKey, { background: id });
    },
    [workspaceKey],
  );

  const setUiThemeId = useCallback(
    (id: EnterpriseThemeId | null) => {
      setUiThemeOverrideState(id);
      if (workspaceKey === "enterprise:pending") return;
      if (typeof window === "undefined") return;
      writeWorkspaceAppearance(workspaceKey, { uiTheme: id });
    },
    [workspaceKey],
  );

  const resetToDefault = useCallback(() => {
    setAccentColorState(DEFAULT_ACCENT);
    setBackgroundThemeIdState(null);
    setUiThemeOverrideState(null);
    if (typeof window === "undefined" || workspaceKey === "enterprise:pending") return;
    deleteWorkspaceAppearance(workspaceKey);
    removeLegacyGlobalAppearanceKeys();
  }, [workspaceKey]);

  const isDark = theme === "dark";
  const dashboardBg = getDashboardBackground(backgroundThemeId, isDark);
  const accentHover = useMemo(() => lightenHex(accentColor, 20), [accentColor]);

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
      uiThemeOverride,
      setUiThemeId,
      workspaceKey,
      cssVariables,
      resetToDefault,
    }),
    [
      accentColor,
      backgroundThemeId,
      cssVariables,
      uiThemeOverride,
      workspaceKey,
      setAccentColor,
      setBackgroundThemeId,
      setUiThemeId,
      resetToDefault,
    ],
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

/** For portaled UI (e.g. immersive preview) that may render on routes without this provider. */
export function useDashboardAppearanceOptional(): DashboardAppearanceContextType | null {
  const context = useContext(DashboardAppearanceContext);
  return context === undefined ? null : context;
}
