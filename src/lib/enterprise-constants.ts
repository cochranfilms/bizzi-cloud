/** Client-safe enterprise constants (no Firebase/server imports). */

/** Default enterprise org pool size (self-serve org creation) */
export const ENTERPRISE_ORG_STORAGE_BYTES = 15 * 1024 * 1024 * 1024 * 1024;

/** Owner reference allocation aligned with default org pool */
export const ENTERPRISE_OWNER_STORAGE_BYTES = 15 * 1024 * 1024 * 1024 * 1024;

/** How seat quota interacts with the org pool (explicit policy). */
export type OrganizationSeatQuotaMode = "fixed" | "org_unlimited";

/** Product UI tiers: fixed byte caps. "Unlimited" = org pool only (`quota_mode: org_unlimited`, bytes null). */
export const PRODUCT_SEAT_STORAGE_BYTES = [
  50 * 1024 * 1024 * 1024,
  100 * 1024 * 1024 * 1024,
  250 * 1024 * 1024 * 1024,
  500 * 1024 * 1024 * 1024,
  1024 * 1024 * 1024 * 1024,
  2 * 1024 * 1024 * 1024 * 1024,
  5 * 1024 * 1024 * 1024 * 1024,
  10 * 1024 * 1024 * 1024 * 1024,
] as const;

const PRODUCT_TIER_SET = new Set<number>(PRODUCT_SEAT_STORAGE_BYTES);

/** Named tiers for labels / exports (optional tooling). */
export const SEAT_STORAGE_TIERS = {
  "50GB": PRODUCT_SEAT_STORAGE_BYTES[0],
  "100GB": PRODUCT_SEAT_STORAGE_BYTES[1],
  "250GB": PRODUCT_SEAT_STORAGE_BYTES[2],
  "500GB": PRODUCT_SEAT_STORAGE_BYTES[3],
  "1TB": PRODUCT_SEAT_STORAGE_BYTES[4],
  "2TB": PRODUCT_SEAT_STORAGE_BYTES[5],
  "5TB": PRODUCT_SEAT_STORAGE_BYTES[6],
  "10TB": PRODUCT_SEAT_STORAGE_BYTES[7],
  unlimited: null as number | null,
} as const;

export type SeatStorageTier = keyof typeof SEAT_STORAGE_TIERS;

/** Default fixed allocation for new member invites / demoted admins */
export const DEFAULT_SEAT_STORAGE_BYTES = PRODUCT_SEAT_STORAGE_BYTES[3];

export function isProductSeatTierByte(bytes: number): boolean {
  return PRODUCT_TIER_SET.has(bytes);
}
