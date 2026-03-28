/**
 * Canonical personal team storage pool accounting (server-only).
 *
 * The team admin’s purchased plan storage (`profiles.storage_quota_bytes`, respecting past_due)
 * is the hard ceiling for:
 * - all files billed to that account (solo personal + hosted team container), and
 * - the sum of fixed per-member caps (active/invited seats + pending invites with fixed tiers).
 *
 * "Unlimited (team pool)" seats do not add to fixed-cap totals; they still consume bytes from
 * the same pool on upload (enforced via `checkUserCanUpload` → owner billable totals).
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { seatNumericCapForEnforcement } from "@/lib/org-seat-quota";
import { adminPurchasedTeamPoolBytes } from "@/lib/profile-purchased-storage-bytes";
import {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
} from "@/lib/personal-team-constants";
import {
  sumPersonalBackupBytesForQuota,
  sumTeamContainerBackupBytes,
} from "@/lib/enterprise-storage";

export { adminPurchasedTeamPoolBytes } from "@/lib/profile-purchased-storage-bytes";

/** Bytes stored in the team workspace (all members + admin uploads tagged with this team owner). */
export async function totalTeamScopedUsedBytes(teamOwnerUid: string): Promise<number> {
  return sumTeamContainerBackupBytes(teamOwnerUid);
}

/**
 * Everything that counts against the admin’s subscription quota (solo personal + hosted team
 * container). Upload enforcement uses this vs `adminPurchasedTeamPoolBytes`.
 */
export async function totalBillableUsedAgainstOwnerPlan(teamOwnerUid: string): Promise<number> {
  return sumPersonalBackupBytesForQuota(teamOwnerUid);
}

/** Sum of fixed caps on active or invited member seats (excludes pending email invites). */
export async function totalFixedCapAllocatedBytes(
  teamOwnerUid: string,
  opts?: { excludeSeatDocId?: string }
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
  return sum;
}

/** Sum of fixed caps reserved by pending invites (not yet accepted). */
export async function totalFixedCapReservedBytes(
  teamOwnerUid: string,
  opts?: { excludeInviteDocId?: string }
): Promise<number> {
  const db = getAdminFirestore();
  const invites = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", teamOwnerUid)
    .where("status", "==", "pending")
    .get();
  let sum = 0;
  for (const d of invites.docs) {
    if (opts?.excludeInviteDocId && d.id === opts.excludeInviteDocId) continue;
    const cap = seatNumericCapForEnforcement(d.data() as Record<string, unknown>);
    if (typeof cap === "number") sum += cap;
  }
  return sum;
}

export function remainingAllocatableBytes(params: {
  poolBytes: number;
  fixedAllocated: number;
  fixedReserved: number;
}): number {
  return Math.max(0, params.poolBytes - params.fixedAllocated - params.fixedReserved);
}

/** Purchased ceiling minus team-folder usage only (informational; does not include admin solo). */
export function remainingUsablePoolBytes(params: {
  poolBytes: number;
  teamScopedUsedBytes: number;
}): number {
  return Math.max(0, params.poolBytes - params.teamScopedUsedBytes);
}

/** Strict upload headroom: plan minus all billable usage (solo + team container). */
export function remainingSubscriptionHeadroomBytes(params: {
  poolBytes: number;
  billableUsedBytes: number;
}): number {
  return Math.max(0, params.poolBytes - params.billableUsedBytes);
}

export interface PersonalTeamPoolAccountingSnapshot {
  admin_purchased_pool_bytes: number;
  total_team_scoped_used_bytes: number;
  total_billable_used_bytes: number;
  total_fixed_cap_allocated_bytes: number;
  total_fixed_cap_reserved_bytes: number;
  /** For assigning new/updated fixed caps: pool − active seat caps − pending invite caps. */
  remaining_fixed_cap_allocatable_bytes: number;
  /** Informational: purchased − bytes in team workspace files only. */
  remaining_team_workspace_headroom_bytes: number;
  /** Upload safety: purchased − full account billable (matches enforcement). */
  remaining_plan_headroom_bytes: number;
  /** Legacy-compatible: allocated + reserved fixed caps. */
  total_fixed_caps_combined_bytes: number;
}

export async function getPersonalTeamPoolAccounting(
  teamOwnerUid: string,
  adminProfileData: Record<string, unknown> | undefined,
  opts?: { excludeSeatDocId?: string; excludeInviteDocId?: string }
): Promise<PersonalTeamPoolAccountingSnapshot> {
  const pool = adminPurchasedTeamPoolBytes(adminProfileData);
  const [teamScoped, billable, fixedAlloc, fixedResv] = await Promise.all([
    totalTeamScopedUsedBytes(teamOwnerUid),
    totalBillableUsedAgainstOwnerPlan(teamOwnerUid),
    totalFixedCapAllocatedBytes(teamOwnerUid, { excludeSeatDocId: opts?.excludeSeatDocId }),
    totalFixedCapReservedBytes(teamOwnerUid, { excludeInviteDocId: opts?.excludeInviteDocId }),
  ]);
  const combinedFixed = fixedAlloc + fixedResv;
  return {
    admin_purchased_pool_bytes: pool,
    total_team_scoped_used_bytes: teamScoped,
    total_billable_used_bytes: billable,
    total_fixed_cap_allocated_bytes: fixedAlloc,
    total_fixed_cap_reserved_bytes: fixedResv,
    remaining_fixed_cap_allocatable_bytes: remainingAllocatableBytes({
      poolBytes: pool,
      fixedAllocated: fixedAlloc,
      fixedReserved: fixedResv,
    }),
    remaining_team_workspace_headroom_bytes: remainingUsablePoolBytes({
      poolBytes: pool,
      teamScopedUsedBytes: teamScoped,
    }),
    remaining_plan_headroom_bytes: remainingSubscriptionHeadroomBytes({
      poolBytes: pool,
      billableUsedBytes: billable,
    }),
    total_fixed_caps_combined_bytes: combinedFixed,
  };
}

export async function validateProposedFixedSeatCap(
  teamOwnerUid: string,
  adminProfileData: Record<string, unknown> | undefined,
  proposedCapBytes: number,
  opts?: { excludeSeatDocId?: string; excludeInviteDocId?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pool = adminPurchasedTeamPoolBytes(adminProfileData);
  const [alloc, resv] = await Promise.all([
    totalFixedCapAllocatedBytes(teamOwnerUid, { excludeSeatDocId: opts?.excludeSeatDocId }),
    totalFixedCapReservedBytes(teamOwnerUid, { excludeInviteDocId: opts?.excludeInviteDocId }),
  ]);
  const rem = remainingAllocatableBytes({
    poolBytes: pool,
    fixedAllocated: alloc,
    fixedReserved: resv,
  });
  if (proposedCapBytes > rem) {
    const poolTb = (pool / (1024 ** 4)).toFixed(1);
    const remTb = (rem / (1024 ** 4)).toFixed(1);
    return {
      ok: false,
      error: `That fixed cap exceeds what is left to assign (${remTb} TB of ${poolTb} TB purchased remains for new fixed caps after other seats and pending invites). Reduce caps elsewhere or upgrade storage.`,
    };
  }
  return { ok: true };
}
