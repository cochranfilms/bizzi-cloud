import type { EnterpriseTheme, EnterpriseThemeId } from "@/types/enterprise";

function lightenHex(hex: string, amount: number): string {
  const parsed = hex.replace(/^#/, "");
  const r = Math.min(255, parseInt(parsed.slice(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(parsed.slice(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(parsed.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export const ENTERPRISE_THEMES: EnterpriseTheme[] = [
  { id: "bizzi", name: "Bizzi", primary: "#00BFFF", accent: "#00D4FF" },
  { id: "slate", name: "Slate", primary: "#475569", accent: "#64748b" },
  { id: "emerald", name: "Emerald", primary: "#059669", accent: "#10b981" },
  { id: "violet", name: "Violet", primary: "#7c3aed", accent: "#8b5cf6" },
  { id: "amber", name: "Amber", primary: "#d97706", accent: "#f59e0b" },
  { id: "rose", name: "Rose", primary: "#e11d48", accent: "#f43f5e" },
  { id: "teal", name: "Teal", primary: "#0d9488", accent: "#14b8a6" },
];

export function getThemeById(id: EnterpriseThemeId): EnterpriseTheme {
  const theme = ENTERPRISE_THEMES.find((t) => t.id === id);
  return theme ?? ENTERPRISE_THEMES[0];
}

export function getThemeVariables(
  themeId: EnterpriseThemeId
): Record<string, string> {
  const theme = getThemeById(themeId);
  return {
    "--enterprise-primary": theme.primary,
    "--enterprise-accent": theme.accent,
  };
}

/** Maps a custom button / chrome color to enterprise CSS variables (nav outlines, sidebar quick access). */
export function getThemeVariablesFromPrimaryHex(hex: string): Record<string, string> {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return getThemeVariables("bizzi");
  }
  return {
    "--enterprise-primary": hex,
    "--enterprise-accent": lightenHex(hex, 28),
  };
}
