"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useDashboardAppearanceOptional } from "@/context/DashboardAppearanceContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { resolveDashboardChromeThemeVariables } from "@/lib/dashboard-chrome-theme";
import type { EnterpriseThemeId } from "@/types/enterprise";

function lightenHex(hex: string, amount: number): string {
  const parsed = hex.replace(/^#/, "");
  const r = Math.min(255, parseInt(parsed.slice(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(parsed.slice(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(parsed.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function darkenHex(hex: string, amount: number): string {
  const parsed = hex.replace(/^#/, "");
  const r = Math.max(0, parseInt(parsed.slice(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(parsed.slice(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(parsed.slice(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const parsed = hex.replace(/^#/, "");
  if (parsed.length !== 6) return null;
  const r = parseInt(parsed.slice(0, 2), 16);
  const g = parseInt(parsed.slice(2, 4), 16);
  const b = parseInt(parsed.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 191, 255, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function useInheritedEnterpriseThemeId(): EnterpriseThemeId {
  const pathname = usePathname() ?? "";
  const teamWs = usePersonalTeamWorkspace();
  const { org } = useEnterprise();
  if (pathname.startsWith("/enterprise")) {
    return org?.theme ?? "bizzi";
  }
  if (teamWs) return teamWs.teamThemeId;
  return "bizzi";
}

/**
 * CSS variables for Bizzi-themed Uppy Dashboard (modal renders outside shell; must set vars here).
 * Mirrors dashboard chrome: custom button color / preset, plus canvas accent from color settings.
 */
export function useUppyBizziThemeVariables(): React.CSSProperties {
  const appearance = useDashboardAppearanceOptional();
  const inherited = useInheritedEnterpriseThemeId();

  return useMemo(() => {
    const accentCanvas = appearance?.accentColor ?? "#00BFFF";
    const buttonColor = appearance?.buttonColor ?? null;
    const uiThemeOverride = appearance?.uiThemeOverride ?? null;

    const chrome = resolveDashboardChromeThemeVariables(
      inherited,
      buttonColor,
      uiThemeOverride
    );

    const primary = chrome["--enterprise-primary"] ?? accentCanvas;
    const accent = chrome["--enterprise-accent"] ?? lightenHex(primary, 24);
    const primaryHover = lightenHex(primary, 18);
    const primaryPressed = darkenHex(primary, 22);

    return {
      ...chrome,
      "--bizzi-uppy-primary": primary,
      "--bizzi-uppy-accent": accent,
      "--bizzi-uppy-primary-hover": primaryHover,
      "--bizzi-uppy-primary-pressed": primaryPressed,
      "--bizzi-uppy-primary-muted": hexToRgba(primary, 0.14),
      "--bizzi-uppy-primary-focus": hexToRgba(primary, 0.42),
      "--bizzi-uppy-focus-ring-dark": hexToRgba(lightenHex(primary, 50), 0.78),
      "--bizzi-uppy-canvas-accent": accentCanvas,
      /* Retry: strong contrast; tint from chrome accent */
      "--bizzi-uppy-retry-bg": darkenHex(accent, 8),
      "--bizzi-uppy-retry-hover": lightenHex(accent, 12),
    } as React.CSSProperties;
  }, [
    appearance?.accentColor,
    appearance?.buttonColor,
    appearance?.uiThemeOverride,
    inherited,
  ]);
}
