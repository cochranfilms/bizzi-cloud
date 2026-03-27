import type { EnterpriseThemeId } from "@/types/enterprise";

const STORAGE_V2 = "bizzi-dashboard-appearance-by-workspace";
const LEGACY_ACCENT = "bizzi-dashboard-accent";
const LEGACY_BACKGROUND = "bizzi-dashboard-background";

export type WorkspaceAppearanceStored = {
  accent?: string;
  background?: string | null;
  uiTheme?: EnterpriseThemeId | null;
};

function safeSessionEnterpriseOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const s = sessionStorage.getItem("bizzi-enterprise-org");
    return s && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

/**
 * Stable workspace id for appearance storage: personal, team:<ownerUid>, or enterprise:<orgId>.
 */
export function getDashboardWorkspaceKey(
  pathname: string | null | undefined,
  orgIdFromContext: string | null | undefined,
): string {
  const p = pathname ?? "";
  if (p.startsWith("/enterprise")) {
    const id = (orgIdFromContext ?? safeSessionEnterpriseOrgId())?.trim();
    if (id) return `enterprise:${id}`;
    return "enterprise:pending";
  }
  const m = /^\/team\/([^/]+)/.exec(p);
  if (m?.[1]) return `team:${m[1]}`;
  return "personal";
}

export function readAllWorkspaceAppearance(): Record<string, WorkspaceAppearanceStored> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_V2);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, WorkspaceAppearanceStored>;
  } catch {
    return {};
  }
}

export function writeWorkspaceAppearance(
  workspaceKey: string,
  patch: WorkspaceAppearanceStored,
) {
  if (typeof window === "undefined") return;
  const all = readAllWorkspaceAppearance();
  const prev = all[workspaceKey] ?? {};
  const next = { ...all, [workspaceKey]: { ...prev, ...patch } };
  localStorage.setItem(STORAGE_V2, JSON.stringify(next));
}

export function deleteWorkspaceAppearance(workspaceKey: string) {
  if (typeof window === "undefined") return;
  const all = readAllWorkspaceAppearance();
  delete all[workspaceKey];
  localStorage.setItem(STORAGE_V2, JSON.stringify(all));
}

/** One-time migration from global accent/background keys to personal slot. */
export function migrateLegacyDashboardAppearanceKeys(): void {
  if (typeof window === "undefined") return;
  const all = readAllWorkspaceAppearance();
  if (Object.keys(all).length > 0) return;

  const accent = localStorage.getItem(LEGACY_ACCENT);
  const bg = localStorage.getItem(LEGACY_BACKGROUND);
  if (!accent && !bg) return;

  const slot: WorkspaceAppearanceStored = {};
  if (accent && /^#[0-9A-Fa-f]{6}$/.test(accent)) slot.accent = accent;
  if (bg) slot.background = bg;

  localStorage.setItem(STORAGE_V2, JSON.stringify({ personal: slot }));
  try {
    localStorage.removeItem(LEGACY_ACCENT);
    localStorage.removeItem(LEGACY_BACKGROUND);
  } catch {
    /* ignore */
  }
}

export function removeLegacyGlobalAppearanceKeys() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_ACCENT);
    localStorage.removeItem(LEGACY_BACKGROUND);
  } catch {
    /* ignore */
  }
}
