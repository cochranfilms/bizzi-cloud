import type { CSSProperties } from "react";

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Vertical wash: light mode white-leaning; dark mode black-leaning. Hue from workspace accent. */
export function immersiveAppBackdropLinear(accentRgb: string, isDark: boolean): string {
  if (isDark) {
    return `linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(${accentRgb},0.11) 34%, rgba(${accentRgb},0.19) 66%, rgba(${accentRgb},0.28) 100%)`;
  }
  return `linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(${accentRgb},0.1) 38%, rgba(${accentRgb},0.17) 68%, rgba(${accentRgb},0.24) 100%)`;
}

export function immersiveWorkspaceEnvironmentKey(
  pathname: string | null
): "personal" | "team" | "organization" {
  const p = pathname ?? "";
  if (p.startsWith("/enterprise")) return "organization";
  if (p.startsWith("/team/")) return "team";
  return "personal";
}

/**
 * Background layers for immersive app preview (non-gallery), without backdrop-filter.
 * Matches ImmersiveFilePreviewShell app variant wash.
 */
export function immersiveAppVariantBackdropStyle(opts: {
  accentRgb: string;
  isDark: boolean;
  pathname: string | null;
}): Pick<CSSProperties, "backgroundColor" | "backgroundImage"> {
  const envKey = immersiveWorkspaceEnvironmentKey(opts.pathname);
  const ambientStrength = envKey === "personal" ? 0.05 : envKey === "team" ? 0.14 : 0.16;
  const ambientStrengthDark = envKey === "personal" ? 0.07 : envKey === "team" ? 0.18 : 0.22;
  const washOpacity = opts.isDark ? ambientStrengthDark : ambientStrength;
  const { accentRgb, isDark } = opts;
  const radialAlpha = isDark
    ? Math.max(0.12, washOpacity * 0.4)
    : Math.max(0.08, washOpacity * 0.35);
  const radial = `radial-gradient(ellipse 92% 72% at 50% -8%, rgba(${accentRgb},${radialAlpha}), transparent 56%)`;
  return {
    backgroundColor: isDark ? "rgba(0, 0, 0, 0.38)" : "rgba(255, 255, 255, 0.14)",
    backgroundImage: `${immersiveAppBackdropLinear(accentRgb, isDark)}, ${radial}`,
  };
}
