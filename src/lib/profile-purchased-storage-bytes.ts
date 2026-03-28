/**
 * Personal-account purchased storage from profile (consumer billing).
 * Shared by upload enforcement, pool accounting, and dashboard display — no Firestore.
 */

import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";

/** Purchased bytes for a personal profile (`profiles` doc), honoring past_due → free tier. */
export function adminPurchasedTeamPoolBytes(
  profileData: Record<string, unknown> | undefined
): number {
  const pastDue = profileData?.billing_status === "past_due";
  const q = profileData?.storage_quota_bytes;
  if (pastDue) return FREE_TIER_STORAGE_BYTES;
  return typeof q === "number" ? q : FREE_TIER_STORAGE_BYTES;
}
