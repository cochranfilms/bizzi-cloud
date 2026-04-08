/**
 * Workspace setup wizard — shared enums, route rules, and profile helpers (client-safe).
 */

export const CURRENT_WORKSPACE_ONBOARDING_VERSION = 1;

export const COLLABORATION_MODES = ["solo", "team"] as const;
export type CollaborationMode = (typeof COLLABORATION_MODES)[number];

export const TEAM_TYPES = [
  "creator",
  "production_company",
  "post_house",
  "brand_inhouse",
  "other",
] as const;
export type TeamType = (typeof TEAM_TYPES)[number];

export const USE_CASES = [
  "dailies",
  "finishing",
  "archive",
  "delivery",
  "general",
] as const;
export type UseCase = (typeof USE_CASES)[number];

const TEAM_TYPE_SET = new Set<string>(TEAM_TYPES);
const USE_CASE_SET = new Set<string>(USE_CASES);

export type WorkspaceOnboardingPayload = {
  collaboration_mode?: CollaborationMode | null;
  team_type?: TeamType | null;
  use_case?: UseCase | null;
  preferred_performance_region?: string | null;
  workspace_display_name?: string | null;
  /** 0-based step index while in progress */
  draft_step?: number | null;
};

export type WorkspaceOnboardingStatus = "pending" | "completed";

export function isValidCollaborationMode(v: string): v is CollaborationMode {
  return v === "solo" || v === "team";
}

export function isValidTeamType(v: string): v is TeamType {
  return TEAM_TYPE_SET.has(v);
}

export function isValidUseCase(v: string): v is UseCase {
  return USE_CASE_SET.has(v);
}

export function normalizeWorkspaceDisplayName(raw: string): string {
  return raw.trim().slice(0, 120);
}

export function parseWorkspaceOnboardingFromProfile(
  data: Record<string, unknown> | undefined
): {
  status: WorkspaceOnboardingStatus | null;
  version: number | null;
  completedAt: string | null;
  onboarding: WorkspaceOnboardingPayload;
} {
  if (!data) {
    return { status: null, version: null, completedAt: null, onboarding: {} };
  }
  const st = data.workspace_onboarding_status;
  const status =
    st === "pending" || st === "completed" ? (st as WorkspaceOnboardingStatus) : null;
  const v = data.workspace_onboarding_version;
  const version = typeof v === "number" && Number.isFinite(v) ? v : null;
  const ca = data.workspace_onboarding_completed_at;
  const completedAt =
    typeof ca === "string" ? ca : ca instanceof Date ? ca.toISOString() : null;
  const blob = data.workspace_onboarding;
  const onboarding: WorkspaceOnboardingPayload =
    blob && typeof blob === "object" && !Array.isArray(blob)
      ? (blob as WorkspaceOnboardingPayload)
      : {};
  return { status, version, completedAt, onboarding };
}

/**
 * Paths where onboarding redirect must not run (avoid traps / billing / invites).
 * Prefix match on **pathname only** (Next.js `usePathname()` has no query string), so
 * `/workspace/setup?review=1` is still exempt — `review=1` never interacts with blocking logic.
 */
export const WORKSPACE_ONBOARDING_ROUTE_EXEMPT_PREFIXES: string[] = [
  "/workspace/setup",
  "/account/",
  "/invite/",
  "/login",
  "/dashboard/settings",
  "/dashboard/change-plan",
  /** Creator app settings mirrors personal settings for billing-related flows */
  "/dashboard/creator/settings",
];

/** Team owner settings while pending — avoid blocking team billing/settings. */
export function isTeamSettingsPathForOwner(pathname: string, ownerUid: string): boolean {
  const re = new RegExp(`^/team/${escapeRegExp(ownerUid)}/settings(?:/|$)`);
  return re.test(pathname);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Enterprise app shell lives under /enterprise — onboarding enforcement is not mounted there.
 */
export function isWorkspaceOnboardingExemptPath(pathname: string, userUid: string): boolean {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  for (const prefix of WORKSPACE_ONBOARDING_ROUTE_EXEMPT_PREFIXES) {
    if (p === prefix || p.startsWith(prefix)) return true;
  }
  if (isTeamSettingsPathForOwner(p, userUid)) return true;
  return false;
}

/**
 * When to redirect a pending user: personal dashboard tree or **owned** team shell only, not exempt.
 *
 * **Non-owners:** `/team/{otherOwnerId}/…` never returns true here — collaborators are not
 * blocked from another user’s team surface by the **owner’s** onboarding flag. Their own
 * `workspace_onboarding_pending` still applies on `/dashboard` (and any route not exempt).
 */
export function shouldEnforceWorkspaceOnboardingRedirect(args: {
  pathname: string;
  userUid: string;
  pending: boolean;
}): boolean {
  if (!args.pending) return false;
  const p = args.pathname.startsWith("/") ? args.pathname : `/${args.pathname}`;
  if (isWorkspaceOnboardingExemptPath(p, args.userUid)) return false;

  if (p.startsWith("/dashboard")) return true;

  const teamMatch = /^\/team\/([^/]+)/.exec(p);
  if (teamMatch) {
    const ownerInPath = teamMatch[1] ?? "";
    if (ownerInPath === args.userUid) return true;
  }

  return false;
}
