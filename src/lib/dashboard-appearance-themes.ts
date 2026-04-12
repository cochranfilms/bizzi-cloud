/** Preset workspace page backgrounds (single surface color; legacy `darkBackground` kept for reference). */
export interface DashboardBackgroundTheme {
  id: string;
  name: string;
  /** Default surface color for this preset */
  lightBackground: string;
  /** @deprecated Previously used when `html.dark`; presets now expose one canonical `lightBackground`. */
  darkBackground: string;
}

export const DASHBOARD_BACKGROUND_THEMES: DashboardBackgroundTheme[] = [
  { id: "white", name: "White", lightBackground: "#ffffff", darkBackground: "#0a0a0a" },
  { id: "off-white", name: "Off-white", lightBackground: "#fafafa", darkBackground: "#171717" },
  { id: "cream", name: "Cream", lightBackground: "#f5f0e8", darkBackground: "#262626" },
  { id: "warm-beige", name: "Warm beige", lightBackground: "#ebe6df", darkBackground: "#1c1917" },
  { id: "light-gray", name: "Light gray", lightBackground: "#f0f0f0", darkBackground: "#27272a" },
  { id: "slate", name: "Slate", lightBackground: "#f8fafc", darkBackground: "#0f172a" },
  { id: "stone", name: "Stone", lightBackground: "#e7e5e4", darkBackground: "#292524" },
  { id: "neutral", name: "Neutral", lightBackground: "#f5f5f5", darkBackground: "#171717" },
  { id: "charcoal", name: "Charcoal", lightBackground: "#404040", darkBackground: "#2d2d2d" },
  { id: "black", name: "Black", lightBackground: "#525252", darkBackground: "#0a0a0a" },
];

/** Default page surface when no custom background is saved (neutral-100). */
export const DEFAULT_DASHBOARD_PAGE_BACKGROUND = "#f5f5f5";

/**
 * Resolves stored workspace background: raw `#rrggbb` or a preset id. Presets map to one canonical color.
 */
export function getDashboardBackground(themeIdOrHex: string | null | undefined): string | null {
  if (!themeIdOrHex) return null;
  if (/^#[0-9A-Fa-f]{6}$/.test(themeIdOrHex)) return themeIdOrHex;
  const theme = DASHBOARD_BACKGROUND_THEMES.find((t) => t.id === themeIdOrHex);
  if (!theme) return null;
  return theme.lightBackground;
}
