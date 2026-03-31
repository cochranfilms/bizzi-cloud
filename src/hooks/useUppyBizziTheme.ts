"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useDashboardAppearanceOptional } from "@/context/DashboardAppearanceContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useTheme } from "@/context/ThemeContext";
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

/** Prefer dark copy on light panels, light copy on dark panels */
function pickContrastingTextHex(bgHex: string): { primary: string; muted: string } {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return { primary: "#171717", muted: "rgba(23,23,23,0.62)" };
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  if (luminance > 0.58) {
    return { primary: "#0c0a09", muted: "rgba(12,10,9,0.58)" };
  }
  return { primary: "#fafaf9", muted: "rgba(250,250,249,0.65)" };
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
  const { theme: appTheme } = useTheme();
  const isDark = appTheme === "dark";

  return useMemo(() => {
    /** Dashboard colors → "Theme" (section / accent tint), not page Background */
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

    const workspaceBg = /^#[0-9A-Fa-f]{6}$/.test(accentCanvas)
      ? accentCanvas
      : isDark
        ? "#0a0a0a"
        : "#f5f5f5";

    const elevatedSurface = isDark
      ? `color-mix(in srgb, ${workspaceBg} 78%, #ffffff 8%)`
      : `color-mix(in srgb, ${workspaceBg} 82%, #ffffff 18%)`;

    const innerWell = isDark
      ? "rgba(255,255,255,0.04)"
      : "rgba(255,255,255,0.45)";

    const { primary: textPrimary, muted: textMuted } = pickContrastingTextHex(workspaceBg);
    const { primary: onPrimary } = pickContrastingTextHex(primary);

    return {
      ...chrome,
      "--bizzi-upload-workspace-bg": workspaceBg,
      "--bizzi-upload-surface-elevated": elevatedSurface,
      "--bizzi-upload-inner-well": innerWell,
      "--bizzi-upload-text": textPrimary,
      "--bizzi-upload-text-muted": textMuted,
      "--bizzi-upload-divider": isDark ? "rgba(255,255,255,0.12)" : "rgba(15,15,15,0.08)",
      "--bizzi-upload-border-subtle": hexToRgba(primary, isDark ? 0.22 : 0.18),
      "--bizzi-uppy-primary": primary,
      "--bizzi-uppy-on-primary": onPrimary,
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
  }, [appearance?.accentColor, appearance?.buttonColor, appearance?.uiThemeOverride, inherited, isDark]);
}
