/**
 * Personal-account teams (not Organizations). Seat docs in `personal_team_seats`.
 * Server-only: uses Admin SDK. For constants/helpers usable on the client, import
 * `@/lib/personal-team-constants` instead.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import { coerceTeamSeatCounts } from "@/lib/team-seat-pricing";
import {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
} from "./personal-team-constants";

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

// Re-export for server code paths that imported these from `@/lib/personal-team`.
export {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
  seatAccessHasEditor,
  seatAccessHasGallery,
  type PersonalTeamInviteStatus,
  type PersonalTeamSeatStatus,
} from "./personal-team-constants";
