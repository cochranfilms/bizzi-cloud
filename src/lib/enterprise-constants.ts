/** Client-safe enterprise constants (no Firebase/server imports). */

/** 16TB total for enterprise orgs to distribute */
export const ENTERPRISE_ORG_STORAGE_BYTES = 16 * 1024 * 1024 * 1024 * 1024;

/** 16TB allocation for all enterprise organization owners */
export const ENTERPRISE_OWNER_STORAGE_BYTES = 16 * 1024 * 1024 * 1024 * 1024;

/** Per-seat storage tier options (bytes). null = Unlimited */
export const SEAT_STORAGE_TIERS = {
  "100GB": 100 * 1024 * 1024 * 1024,
  "500GB": 500 * 1024 * 1024 * 1024,
  "1TB": 1024 * 1024 * 1024 * 1024,
  "2TB": 2 * 1024 * 1024 * 1024 * 1024,
  unlimited: null as number | null,
} as const;

export type SeatStorageTier = keyof typeof SEAT_STORAGE_TIERS;

/** Default allocation for new seats */
export const DEFAULT_SEAT_STORAGE_BYTES = SEAT_STORAGE_TIERS["1TB"];
