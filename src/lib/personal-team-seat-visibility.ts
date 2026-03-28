/**
 * Canonical seat-status rules for personal team memberships (client-safe, no Firebase).
 *
 * ## Product: `cold_storage` and the workspace switcher (single source of truth)
 *
 * **Decision (2026):** Non-owned memberships whose seat status is `cold_storage` **remain
 * visible** in the workspace switcher and show a **recovery-style status label** (e.g.
 * “Recovery Storage”), not a blank/hidden row. This keeps a clear path back to team assets
 * under recovery/lifecycle rules.
 *
 * To change this behavior (e.g. hide cold_storage teams from the switcher entirely),
 * update `PERSONAL_TEAM_COLD_STORAGE_MEMBERSHIP_VISIBLE_IN_SWITCHER` and
 * `seatStatusShowsInSwitcher` only in this file, then adjust API labels and tests.
 */
export const PERSONAL_TEAM_COLD_STORAGE_MEMBERSHIP_VISIBLE_IN_SWITCHER = true as const;

/** Seat statuses that allow entering team workspace (API + client gate). */
export function seatStatusAllowsEnter(status: string | undefined): boolean {
  return status === "active" || status === "cold_storage";
}

/** Seat statuses that count toward max non-owned team memberships. */
export function seatStatusCountsTowardMembershipCap(status: string | undefined): boolean {
  return status === "active";
}

/**
 * Seat statuses that appear in the workspace switcher as a non-owned team row.
 * @see PERSONAL_TEAM_COLD_STORAGE_MEMBERSHIP_VISIBLE_IN_SWITCHER
 */
export function seatStatusShowsInSwitcher(status: string | undefined): boolean {
  if (status === "active") return true;
  if (status === "cold_storage") return PERSONAL_TEAM_COLD_STORAGE_MEMBERSHIP_VISIBLE_IN_SWITCHER;
  return false;
}
