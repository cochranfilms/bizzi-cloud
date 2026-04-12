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
import { useEnterprise } from "@/context/EnterpriseContext";
import {
  DEFAULT_DASHBOARD_PAGE_BACKGROUND,
  getDashboardBackground,
} from "@/lib/dashboard-appearance-themes";
import { shouldUseDarkUiTokensForPageBackground } from "@/lib/color-luminance";
import { isDashboardWorkspacePath } from "@/lib/dashboard-workspace-routes";
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
const DEFAULT_LOGO_ICON = "#ffffff";
const DEFAULT_LOGO_LIGHTNING = "#00BFFF";

interface DashboardAppearanceContextType {
  accentColor: string;
  setAccentColor: (hex: string) => void;
  backgroundThemeId: string | null;
  setBackgroundThemeId: (id: string | null) => void;
  /** Legacy preset-only override; superseded by buttonColor when set. */
  uiThemeOverride: EnterpriseThemeId | null;
  setUiThemeId: (id: EnterpriseThemeId | null) => void;
  /** Custom #rrggbb for main nav + quick access chrome; null = inherit org/team preset colors. */
  buttonColor: string | null;
  setButtonColor: (hex: string | null) => void;
  /** Logo “B” / icon shape; null = default white */
  logoIconColor: string | null;
  setLogoIconColor: (hex: string | null) => void;
  /** Logo lightning bolt; null = default cyan */
  logoLightningColor: string | null;
  setLogoLightningColor: (hex: string | null) => void;
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
  const [buttonColor, setButtonColorState] = useState<string | null>(null);
  const [logoIconColor, setLogoIconColorState] = useState<string | null>(null);
  const [logoLightningColor, setLogoLightningColorState] = useState<string | null>(null);
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
      setButtonColorState(null);
      setLogoIconColorState(null);
      setLogoLightningColorState(null);
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
    setButtonColorState(
      slot.buttonColor && /^#[0-9A-Fa-f]{6}$/.test(slot.buttonColor)
        ? slot.buttonColor
        : null,
    );
    setLogoIconColorState(
      slot.logoIconColor && /^#[0-9A-Fa-f]{6}$/.test(slot.logoIconColor)
        ? slot.logoIconColor
        : null,
    );
    setLogoLightningColorState(
      slot.logoLightningColor && /^#[0-9A-Fa-f]{6}$/.test(slot.logoLightningColor)
        ? slot.logoLightningColor
        : null,
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

  const setButtonColor = useCallback(
    (hex: string | null) => {
      setButtonColorState(hex);
      if (workspaceKey === "enterprise:pending") return;
      if (typeof window === "undefined") return;
      if (hex === null) {
        writeWorkspaceAppearance(workspaceKey, { buttonColor: null });
        return;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      writeWorkspaceAppearance(workspaceKey, { buttonColor: hex, uiTheme: null });
      setUiThemeOverrideState(null);
    },
    [workspaceKey],
  );

  const setLogoIconColor = useCallback(
    (hex: string | null) => {
      setLogoIconColorState(hex);
      if (workspaceKey === "enterprise:pending") return;
      if (typeof window === "undefined") return;
      if (hex === null) {
        writeWorkspaceAppearance(workspaceKey, { logoIconColor: null });
        return;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      writeWorkspaceAppearance(workspaceKey, { logoIconColor: hex });
    },
    [workspaceKey],
  );

  const setLogoLightningColor = useCallback(
    (hex: string | null) => {
      setLogoLightningColorState(hex);
      if (workspaceKey === "enterprise:pending") return;
      if (typeof window === "undefined") return;
      if (hex === null) {
        writeWorkspaceAppearance(workspaceKey, { logoLightningColor: null });
        return;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      writeWorkspaceAppearance(workspaceKey, { logoLightningColor: hex });
    },
    [workspaceKey],
  );

  const resetToDefault = useCallback(() => {
    setAccentColorState(DEFAULT_ACCENT);
    setBackgroundThemeIdState(null);
    setUiThemeOverrideState(null);
    setButtonColorState(null);
    setLogoIconColorState(null);
    setLogoLightningColorState(null);
    if (typeof window === "undefined" || workspaceKey === "enterprise:pending") return;
    deleteWorkspaceAppearance(workspaceKey);
    removeLegacyGlobalAppearanceKeys();
  }, [workspaceKey]);

  const dashboardPageBackground =
    workspaceKey === "enterprise:pending"
      ? DEFAULT_DASHBOARD_PAGE_BACKGROUND
      : (getDashboardBackground(backgroundThemeId) ?? DEFAULT_DASHBOARD_PAGE_BACKGROUND);
  const accentHover = useMemo(() => lightenHex(accentColor, 20), [accentColor]);

  const sectionTitleBg = useMemo(() => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(accentColor)) return "rgba(0, 191, 255, 0.2)";
    const parsed = accentColor.replace(/^#/, "");
    const r = parseInt(parsed.slice(0, 2), 16);
    const g = parseInt(parsed.slice(2, 4), 16);
    const b = parseInt(parsed.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.2)`;
  }, [accentColor]);

  const resolvedLogoIcon = logoIconColor ?? DEFAULT_LOGO_ICON;
  const resolvedLogoLightning = logoLightningColor ?? DEFAULT_LOGO_LIGHTNING;

  const cssVariables: React.CSSProperties = useMemo(() => {
    const vars: Record<string, string> = {
      "--bizzi-accent": accentColor,
      "--bizzi-accent-hover": accentHover,
      "--bizzi-section-title-bg": sectionTitleBg,
      "--dashboard-bg": dashboardPageBackground,
      "--dashboard-logo-icon": resolvedLogoIcon,
      "--dashboard-logo-lightning": resolvedLogoLightning,
      backgroundColor: dashboardPageBackground,
    };
    return vars as React.CSSProperties;
  }, [
    accentColor,
    accentHover,
    dashboardPageBackground,
    resolvedLogoIcon,
    resolvedLogoLightning,
    sectionTitleBg,
  ]);

  useEffect(() => {
    if (typeof document === "undefined" || !hydrated) return;
    if (!isDashboardWorkspacePath(pathname)) return;
    const dark = shouldUseDarkUiTokensForPageBackground(dashboardPageBackground);
    document.documentElement.classList.toggle("dark", dark);
  }, [hydrated, pathname, dashboardPageBackground]);

  const contextValue: DashboardAppearanceContextType = useMemo(
    () => ({
      accentColor,
      setAccentColor,
      backgroundThemeId,
      setBackgroundThemeId,
      uiThemeOverride,
      setUiThemeId,
      buttonColor,
      setButtonColor,
      logoIconColor,
      setLogoIconColor,
      logoLightningColor,
      setLogoLightningColor,
      workspaceKey,
      cssVariables,
      resetToDefault,
    }),
    [
      accentColor,
      backgroundThemeId,
      cssVariables,
      uiThemeOverride,
      buttonColor,
      logoIconColor,
      logoLightningColor,
      workspaceKey,
      setAccentColor,
      setBackgroundThemeId,
      setUiThemeId,
      setButtonColor,
      setLogoIconColor,
      setLogoLightningColor,
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
