import { getThemeById } from "@/lib/enterprise-themes";
import type { EnterpriseThemeId } from "@/types/enterprise";

const DEFAULT_ACCENT = "#00BFFF";

/**
 * Primary accent used for the inner ring on immersive preview chrome: enterprise org theme,
 * team workspace theme, or personal dashboard accent.
 */
export function resolveImmersiveWorkspaceAccent(opts: {
  pathname: string | null | undefined;
  orgTheme: EnterpriseThemeId | null | undefined;
  teamThemeId: EnterpriseThemeId | null | undefined;
  /** Personal dashboard accent from settings */
  dashboardAccentHex: string;
}): string {
  const p = opts.pathname ?? "";
  if (p.startsWith("/enterprise")) {
    return getThemeById(opts.orgTheme ?? "bizzi").primary;
  }
  if (p.startsWith("/team/")) {
    return getThemeById(opts.teamThemeId ?? "bizzi").primary;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(opts.dashboardAccentHex)) {
    return opts.dashboardAccentHex;
  }
  return DEFAULT_ACCENT;
}
