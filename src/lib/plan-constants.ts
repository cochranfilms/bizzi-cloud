/**
 * Plan IDs, storage quotas, and Stripe price ID mapping.
 * Set Stripe price IDs in env after creating Products/Prices in Stripe Dashboard.
 */

export type PlanId = "free" | "solo" | "indie" | "video" | "production";
export type AddonId = "gallery" | "editor" | "fullframe";

/** Storage quota in bytes per plan */
export const PLAN_STORAGE_BYTES: Record<PlanId, number> = {
  free: 2 * 1024 * 1024 * 1024, // 2 GB
  solo: 1 * 1024 * 1024 * 1024 * 1024, // 1 TB
  indie: 2 * 1024 * 1024 * 1024 * 1024, // 2 TB
  video: 5 * 1024 * 1024 * 1024 * 1024, // 5 TB
  production: 10 * 1024 * 1024 * 1024 * 1024, // 10 TB
};

/** Default storage for new/free users */
export const FREE_TIER_STORAGE_BYTES = PLAN_STORAGE_BYTES.free;

/** Get storage bytes for a plan ID */
export function getStorageBytesForPlan(planId: PlanId): number {
  return PLAN_STORAGE_BYTES[planId] ?? PLAN_STORAGE_BYTES.free;
}

/** Stripe price ID env vars. Set these in Vercel after creating Products/Prices. */
const STRIPE_PRICE_ENV_KEYS = {
  solo_monthly: "STRIPE_PRICE_SOLO_MONTHLY",
  solo_annual: "STRIPE_PRICE_SOLO_ANNUAL",
  indie_monthly: "STRIPE_PRICE_INDIE_MONTHLY",
  indie_annual: "STRIPE_PRICE_INDIE_ANNUAL",
  video_monthly: "STRIPE_PRICE_VIDEO_MONTHLY",
  video_annual: "STRIPE_PRICE_VIDEO_ANNUAL",
  production_monthly: "STRIPE_PRICE_PRODUCTION_MONTHLY",
  production_annual: "STRIPE_PRICE_PRODUCTION_ANNUAL",
  gallery: "STRIPE_PRICE_GALLERY",
  gallery_annual: "STRIPE_PRICE_GALLERY_ANNUAL",
  editor: "STRIPE_PRICE_EDITOR",
  editor_annual: "STRIPE_PRICE_EDITOR_ANNUAL",
  fullframe: "STRIPE_PRICE_FULLFRAME",
  fullframe_annual: "STRIPE_PRICE_FULLFRAME_ANNUAL",
  seat: "STRIPE_PRICE_SEAT",
} as const;

export type BillingCycle = "monthly" | "annual";

/** Get Stripe price ID for a plan + billing cycle */
export function getStripePriceId(
  planId: Exclude<PlanId, "free">,
  billing: BillingCycle
): string | null {
  const key =
    billing === "monthly"
      ? `${planId}_monthly`
      : `${planId}_annual`;
  const envKey = STRIPE_PRICE_ENV_KEYS[key as keyof typeof STRIPE_PRICE_ENV_KEYS];
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}

/** Get Stripe price ID for an addon (monthly or annual). */
export function getStripeAddonPriceId(
  addonId: AddonId,
  billing: BillingCycle = "monthly"
): string | null {
  if (billing === "annual") {
    const annualKey = `${addonId}_annual` as keyof typeof STRIPE_PRICE_ENV_KEYS;
    const annualEnv = STRIPE_PRICE_ENV_KEYS[annualKey];
    if (annualEnv) return process.env[annualEnv] ?? null;
  }
  const envKey = STRIPE_PRICE_ENV_KEYS[addonId];
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}

/** Get Stripe price ID for extra seat add-on ($9/mo) */
export function getStripeSeatPriceId(): string | null {
  return process.env[STRIPE_PRICE_ENV_KEYS.seat] ?? null;
}

/** Personal team seat tier + billing (optional env override per tier) */
export function getStripePersonalTeamSeatPriceId(
  level: "none" | "gallery" | "editor" | "fullframe",
  billing: BillingCycle
): string | null {
  const cycle = billing === "monthly" ? "MONTHLY" : "ANNUAL";
  const key = `STRIPE_PRICE_TEAM_SEAT_${level.toUpperCase()}_${cycle}` as const;
  return process.env[key] ?? null;
}

/** Resolve plan ID or addon ID from Stripe price ID (for webhook) */
export function getPlanIdFromPriceId(priceId: string): PlanId | AddonId | null {
  for (const plan of ["solo", "indie", "video", "production"] as const) {
    const monthlyKey = `${plan}_monthly` as keyof typeof STRIPE_PRICE_ENV_KEYS;
    const annualKey = `${plan}_annual` as keyof typeof STRIPE_PRICE_ENV_KEYS;
    const monthly = process.env[STRIPE_PRICE_ENV_KEYS[monthlyKey]];
    const annual = process.env[STRIPE_PRICE_ENV_KEYS[annualKey]];
    if (monthly === priceId || annual === priceId) return plan;
  }
  for (const addon of ["gallery", "editor", "fullframe"] as const) {
    const envVal = process.env[STRIPE_PRICE_ENV_KEYS[addon]];
    if (envVal === priceId) return addon;
    const annualKey = `${addon}_annual` as keyof typeof STRIPE_PRICE_ENV_KEYS;
    const annualVal = process.env[STRIPE_PRICE_ENV_KEYS[annualKey]];
    if (annualVal === priceId) return addon;
  }
  return null;
}

/**
 * Document all required env vars for Stripe integration.
 * Add to Vercel after creating Products/Prices in Stripe Dashboard:
 *
 * Base plans (create Products + Prices in Stripe):
 *   STRIPE_PRICE_SOLO_MONTHLY, STRIPE_PRICE_SOLO_ANNUAL
 *   STRIPE_PRICE_INDIE_MONTHLY, STRIPE_PRICE_INDIE_ANNUAL
 *   STRIPE_PRICE_VIDEO_MONTHLY, STRIPE_PRICE_VIDEO_ANNUAL
 *   STRIPE_PRICE_PRODUCTION_MONTHLY, STRIPE_PRICE_PRODUCTION_ANNUAL
 *
 * Addons (monthly + optional annual for Checkout; all line items must share one interval):
 *   STRIPE_PRICE_GALLERY, STRIPE_PRICE_EDITOR, STRIPE_PRICE_FULLFRAME
 *   STRIPE_PRICE_GALLERY_ANNUAL, STRIPE_PRICE_EDITOR_ANNUAL, STRIPE_PRICE_FULLFRAME_ANNUAL
 *
 * Seats:
 *   STRIPE_PRICE_SEAT — extra seat at $9/mo (for indie, video, production)
 */
export const STRIPE_PRICE_ENV_KEYS_LIST = Object.values(STRIPE_PRICE_ENV_KEYS);
