/**
 * Personal team identifiers and pure helpers — safe for client or server (no firebase-admin).
 */
import type { PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";

export const PERSONAL_TEAM_SEATS_COLLECTION = "personal_team_seats";
export const PERSONAL_TEAM_INVITES_COLLECTION = "personal_team_invites";
/** Canonical ownership row: doc id === owner_user_id === team_id (v1). */
export const PERSONAL_TEAMS_COLLECTION = "personal_teams";
/** Seat memberships on others' teams that count toward invite/accept cap (active only). */
export const MAX_ACTIVE_NON_OWNED_PERSONAL_TEAM_MEMBERSHIPS = 3;
/** Team-scoped settings for synthetic personal team workspaces (keyed by team owner uid). */
export const PERSONAL_TEAM_SETTINGS_COLLECTION = "personal_team_settings";

export function personalTeamSeatDocId(teamOwnerUid: string, memberUid: string): string {
  return `${teamOwnerUid}_${memberUid}`;
}

export type PersonalTeamSeatStatus = "invited" | "active" | "removed" | "cold_storage";

export type PersonalTeamInviteStatus = "pending" | "accepted" | "cancelled" | "expired";

export function seatAccessHasGallery(level: PersonalTeamSeatAccess): boolean {
  return level === "gallery" || level === "fullframe";
}

export function seatAccessHasEditor(level: PersonalTeamSeatAccess): boolean {
  return level === "editor" || level === "fullframe";
}
