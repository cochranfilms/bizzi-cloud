/**
 * Personal team seat storage caps vs the team owner's plan pool (server-only).
 * Mirrors organization seat semantics: quota_mode + storage_quota_bytes on seats/invites.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";
import { seatNumericCapForEnforcement } from "@/lib/org-seat-quota";
import {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
} from "@/lib/personal-team-constants";

export function teamOwnerPoolBytes(profileData: Record<string, unknown> | undefined): number {
  const pastDue = profileData?.billing_status === "past_due";
  const q = profileData?.storage_quota_bytes;
  if (pastDue) return FREE_TIER_STORAGE_BYTES;
  return typeof q === "number" ? q : FREE_TIER_STORAGE_BYTES;
}

/** Sum of fixed per-seat caps for active/invited members and pending email invites. */
export async function sumPersonalTeamFixedSeatAllocations(
  teamOwnerUid: string,
  opts?: { excludeSeatDocId?: string; excludeInviteDocId?: string }
): Promise<number> {
  const db = getAdminFirestore();
  let sum = 0;
  const seats = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", teamOwnerUid)
    .get();
  for (const d of seats.docs) {
    if (opts?.excludeSeatDocId && d.id === opts.excludeSeatDocId) continue;
    const st = (d.data().status as string | undefined) ?? "";
    if (st !== "active" && st !== "invited") continue;
    const cap = seatNumericCapForEnforcement(d.data() as Record<string, unknown>);
    if (typeof cap === "number") sum += cap;
  }
  const invites = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", teamOwnerUid)
    .where("status", "==", "pending")
    .get();
  for (const d of invites.docs) {
    if (opts?.excludeInviteDocId && d.id === opts.excludeInviteDocId) continue;
    const cap = seatNumericCapForEnforcement(d.data() as Record<string, unknown>);
    if (typeof cap === "number") sum += cap;
  }
  return sum;
}
