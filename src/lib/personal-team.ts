/**
 * Personal-account teams (not Organizations). Seat docs in `personal_team_seats`.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import { coerceTeamSeatCounts } from "@/lib/team-seat-pricing";

export const PERSONAL_TEAM_SEATS_COLLECTION = "personal_team_seats";
export const PERSONAL_TEAM_INVITES_COLLECTION = "personal_team_invites";

export function personalTeamSeatDocId(teamOwnerUid: string, memberUid: string): string {
  return `${teamOwnerUid}_${memberUid}`;
}

export type PersonalTeamSeatStatus = "invited" | "active" | "removed" | "cold_storage";

export type PersonalTeamInviteStatus = "pending" | "accepted" | "cancelled" | "expired";

export async function countAssignedSeatsForTier(
  teamOwnerUid: string,
  level: PersonalTeamSeatAccess,
  excludeMemberUid?: string
): Promise<number> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", teamOwnerUid)
    .get();
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const st = data.status as string;
    if (st !== "active" && st !== "invited") continue;
    if (data.seat_access_level !== level) continue;
    const mid = data.member_user_id as string | undefined;
    if (excludeMemberUid && mid === excludeMemberUid) continue;
    n++;
  }
  return n;
}

/** Pending email invites awaiting signup (same capacity as assigned seats). */
export async function countPendingInvitesForTier(
  teamOwnerUid: string,
  level: PersonalTeamSeatAccess
): Promise<number> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", teamOwnerUid)
    .where("status", "==", "pending")
    .get();
  let n = 0;
  for (const d of snap.docs) {
    if (d.data().seat_access_level === level) n++;
  }
  return n;
}

/** Active/invited seat assignments plus pending email invites for downgrade / capacity checks. */
export async function countUsedSeatsForTier(
  teamOwnerUid: string,
  level: PersonalTeamSeatAccess,
  excludeMemberUid?: string
): Promise<number> {
  const assigned = await countAssignedSeatsForTier(teamOwnerUid, level, excludeMemberUid);
  const pending = await countPendingInvitesForTier(teamOwnerUid, level);
  return assigned + pending;
}

/**
 * Returns an error message if no capacity, or null if OK.
 */
export async function validateTeamSeatCapacity(
  teamOwnerUid: string,
  profileData: Record<string, unknown> | undefined,
  level: PersonalTeamSeatAccess
): Promise<string | null> {
  const counts = coerceTeamSeatCounts(profileData?.team_seat_counts ?? {});
  const limit = counts[level];
  const used = await countUsedSeatsForTier(teamOwnerUid, level);
  if (used >= limit) {
    return "No remaining team seats at this access level. Purchase more or remove a member.";
  }
  return null;
}

export function seatAccessHasGallery(level: PersonalTeamSeatAccess): boolean {
  return level === "gallery" || level === "fullframe";
}

export function seatAccessHasEditor(level: PersonalTeamSeatAccess): boolean {
  return level === "editor" || level === "fullframe";
}
