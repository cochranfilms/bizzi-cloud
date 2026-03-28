/**
 * Personal team seat storage caps vs the team owner's plan pool (server-only).
 * Canonical math lives in `personal-team-pool-accounting.ts`.
 */

import {
  adminPurchasedTeamPoolBytes,
  totalFixedCapAllocatedBytes,
  totalFixedCapReservedBytes,
} from "@/lib/personal-team-pool-accounting";

/** @deprecated Use adminPurchasedTeamPoolBytes — kept for existing imports. */
export const teamOwnerPoolBytes = adminPurchasedTeamPoolBytes;

/** Sum of fixed per-seat caps for active/invited members and pending email invites. */
export async function sumPersonalTeamFixedSeatAllocations(
  teamOwnerUid: string,
  opts?: { excludeSeatDocId?: string; excludeInviteDocId?: string }
): Promise<number> {
  const [a, r] = await Promise.all([
    totalFixedCapAllocatedBytes(teamOwnerUid, { excludeSeatDocId: opts?.excludeSeatDocId }),
    totalFixedCapReservedBytes(teamOwnerUid, { excludeInviteDocId: opts?.excludeInviteDocId }),
  ]);
  return a + r;
}
