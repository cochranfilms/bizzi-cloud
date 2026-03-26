/**
 * Personal team identifiers and pure helpers — safe for client or server (no firebase-admin).
 */
import type { PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";

export const PERSONAL_TEAM_SEATS_COLLECTION = "personal_team_seats";
export const PERSONAL_TEAM_INVITES_COLLECTION = "personal_team_invites";

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
