/**
 * Dynamically create Stripe Products and Prices on first use.
 * Caches price IDs in Firestore so no manual env vars are needed.
 * Falls back to env vars (STRIPE_PRICE_*) if set, for backward compatibility.
 */

import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import { annualPriceUsdFromMonthly, type StorageAddonId } from "@/lib/pricing-data";
import {
  getStripePriceId as getEnvPriceId,
  getStripeAddonPriceId as getEnvAddonPriceId,
  getStripeSeatPriceId as getEnvSeatPriceId,
  getStripePersonalTeamSeatPriceId as getEnvPersonalTeamSeatPriceId,
} from "@/lib/plan-constants";
import type { PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import {
  teamSeatAnnualCentsPerSeat,
  teamSeatMonthlyCentsPerSeat,
} from "@/lib/team-seat-pricing";

const FIRESTORE_COLLECTION = "stripe_prices";

/** Plan pricing: [monthly cents, annual cents] */
const PLAN_PRICING: Record<Exclude<PlanId, "free">, { name: string; monthly: number; annual: number }> = {
  solo: { name: "Bizzi Creator", monthly: 1200, annual: annualPriceUsdFromMonthly(12) * 100 },
  indie: { name: "Bizzi Pro", monthly: 2000, annual: annualPriceUsdFromMonthly(20) * 100 },
  video: { name: "Bizzi Network", monthly: 4500, annual: annualPriceUsdFromMonthly(45) * 100 },
  production: { name: "Enterprise Creative", monthly: 9000, annual: annualPriceUsdFromMonthly(90) * 100 },
};

/** Addon pricing: monthly cents */
const ADDON_PRICING: Record<AddonId, { name: string; monthly: number }> = {
  gallery: { name: "Bizzi Gallery Suite", monthly: 800 },
  editor: { name: "Bizzi Editor", monthly: 1500 },
  fullframe: { name: "Bizzi Full Frame", monthly: 2000 },
};

/** Storage add-on pricing: monthly cents. Indie +1/+2/+3 TB, Video +1..+5 TB */
const STORAGE_ADDON_PRICING: Record<StorageAddonId, { name: string; monthly: number; plan: "indie" | "video"; tb: number }> = {
  indie_1: { name: "Additional Storage +1 TB (Bizzi Pro)", monthly: 1000, plan: "indie", tb: 1 },
  indie_2: { name: "Additional Storage +2 TB (Bizzi Pro)", monthly: 2000, plan: "indie", tb: 2 },
  indie_3: { name: "Additional Storage +3 TB (Bizzi Pro)", monthly: 3000, plan: "indie", tb: 3 },
  video_1: { name: "Additional Storage +1 TB (Bizzi Network)", monthly: 1000, plan: "video", tb: 1 },
  video_2: { name: "Additional Storage +2 TB (Bizzi Network)", monthly: 2000, plan: "video", tb: 2 },
  video_3: { name: "Additional Storage +3 TB (Bizzi Network)", monthly: 3000, plan: "video", tb: 3 },
  video_4: { name: "Additional Storage +4 TB (Bizzi Network)", monthly: 4000, plan: "video", tb: 4 },
  video_5: { name: "Additional Storage +5 TB (Bizzi Network)", monthly: 5000, plan: "video", tb: 5 },
};

/** Get price ID from env if set (backward compat) */
function getEnvFallback(planId: Exclude<PlanId, "free">, billing: BillingCycle): string | null {
  return getEnvPriceId(planId, billing);
}

function getEnvAddonFallback(addonId: AddonId): string | null {
  return getEnvAddonPriceId(addonId);
}

function getEnvSeatFallback(): string | null {
  return getEnvSeatPriceId();
}

/**
 * Get or create Stripe price for a plan. Caches in Firestore.
 * Uses env STRIPE_PRICE_* if set; otherwise creates Product+Price in Stripe.
 */
export async function getOrCreateStripePrice(
  planId: Exclude<PlanId, "free">,
  billing: BillingCycle
): Promise<string> {
  const envPrice = getEnvFallback(planId, billing);
  if (envPrice) return envPrice;

  const docId = `${planId}_${billing}`;
  const db = getAdminFirestore();
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);
  const snap = await docRef.get();

  if (snap.exists) {
    const priceId = snap.data()?.price_id as string | undefined;
    if (priceId) return priceId;
  }

  const pricing = PLAN_PRICING[planId];
  if (!pricing) throw new Error(`Unknown plan: ${planId}`);

  const amountCents = billing === "monthly" ? pricing.monthly : pricing.annual;
  const interval = billing === "monthly" ? "month" : "year";

  const stripe = getStripeInstance();

  try {
    const product = await stripe.products.create({
      name: pricing.name,
      metadata: { plan_id: planId, billing },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amountCents,
      currency: "usd",
      recurring: { interval },
      metadata: { plan_id: planId, billing },
    });

    await docRef.set({
      price_id: price.id,
      product_id: product.id,
      plan_id: planId,
      billing,
      updated_at: new Date().toISOString(),
    });

    return price.id;
  } catch (err) {
    console.error("[Stripe getOrCreatePrice] Failed to create:", err);
    throw err;
  }
}

/**
 * Get or create Stripe price for an addon. Caches in Firestore.
 * Validates cached/env price amounts match ADDON_PRICING; recreates if outdated.
 */
export async function getOrCreateStripeAddonPrice(addonId: AddonId): Promise<string> {
  const pricing = ADDON_PRICING[addonId];
  if (!pricing) throw new Error(`Unknown addon: ${addonId}`);

  const expectedCents = pricing.monthly;
  const stripe = getStripeInstance();

  /** Validate a price ID: returns true if amount matches, false if stale or invalid */
  async function isPriceValid(priceId: string): Promise<boolean> {
    try {
      const price = await stripe.prices.retrieve(priceId);
      return price.unit_amount === expectedCents && price.currency === "usd";
    } catch {
      return false;
    }
  }

  // Check env var first; validate amount and recreate if stale
  const envPrice = getEnvAddonFallback(addonId);
  if (envPrice) {
    if (await isPriceValid(envPrice)) return envPrice;
    console.warn(
      `[Stripe] STRIPE_PRICE_${addonId.toUpperCase()} has wrong amount; creating new price at $${(expectedCents / 100).toFixed(2)}`
    );
  }

  const docId = `addon_${addonId}`;
  const db = getAdminFirestore();
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);
  const snap = await docRef.get();

  if (snap.exists) {
    const priceId = snap.data()?.price_id as string | undefined;
    if (priceId && (await isPriceValid(priceId))) return priceId;
  }

  try {
    const product = await stripe.products.create({
      name: pricing.name,
      metadata: { addon_id: addonId },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: expectedCents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { addon_id: addonId },
    });

    await docRef.set({
      price_id: price.id,
      product_id: product.id,
      addon_id: addonId,
      unit_amount_cents: expectedCents,
      updated_at: new Date().toISOString(),
    });

    return price.id;
  } catch (err) {
    console.error("[Stripe getOrCreateAddonPrice] Failed to create:", err);
    throw err;
  }
}

/** Get or create Stripe price for storage add-on. Caches in Firestore. */
export async function getOrCreateStripeStorageAddonPrice(storageAddonId: StorageAddonId): Promise<string> {
  const docId = `storage_${storageAddonId}`;
  const db = getAdminFirestore();
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);
  const snap = await docRef.get();
  if (snap.exists) {
    const priceId = snap.data()?.price_id as string | undefined;
    if (priceId) return priceId;
  }
  const pricing = STORAGE_ADDON_PRICING[storageAddonId];
  if (!pricing) throw new Error(`Unknown storage addon: ${storageAddonId}`);
  const stripe = getStripeInstance();
  const product = await stripe.products.create({
    name: pricing.name,
    metadata: { storage_addon_id: storageAddonId, storage_addon_plan: pricing.plan, storage_addon_tb: String(pricing.tb) },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: pricing.monthly,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { storage_addon_id: storageAddonId, storage_addon_plan: pricing.plan, storage_addon_tb: String(pricing.tb) },
  });
  await docRef.set({ price_id: price.id, product_id: product.id, storage_addon_id: storageAddonId, updated_at: new Date().toISOString() });
  return price.id;
}

/** Enterprise storage tier IDs for recurring subscription prices */
export type EnterpriseStorageTierId = "1tb" | "5tb" | "15tb";

/** Enterprise storage pricing: monthly cents */
const ENTERPRISE_STORAGE_PRICING: Record<EnterpriseStorageTierId, { name: string; monthly: number }> = {
  "1tb": { name: "Enterprise Storage 1 TB", monthly: 5000 },
  "5tb": { name: "Enterprise Storage 5 TB", monthly: 20000 },
  "15tb": { name: "Enterprise Storage 15 TB", monthly: 50000 },
};

/** Get or create Stripe price for enterprise storage. Caches in Firestore. */
export async function getOrCreateStripeEnterpriseStoragePrice(
  tierId: EnterpriseStorageTierId
): Promise<string> {
  const docId = `enterprise_storage_${tierId}`;
  const db = getAdminFirestore();
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);
  const snap = await docRef.get();

  if (snap.exists) {
    const priceId = snap.data()?.price_id as string | undefined;
    if (priceId) return priceId;
  }

  const pricing = ENTERPRISE_STORAGE_PRICING[tierId];
  if (!pricing) throw new Error(`Unknown enterprise storage tier: ${tierId}`);

  const stripe = getStripeInstance();

  const product = await stripe.products.create({
    name: pricing.name,
    metadata: { enterprise_storage_tier: tierId },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: pricing.monthly,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { enterprise_storage_tier: tierId },
  });

  await docRef.set({
    price_id: price.id,
    product_id: product.id,
    enterprise_storage_tier: tierId,
    updated_at: new Date().toISOString(),
  });

  return price.id;
}

/** Extra seat price (legacy org line item). Get or create Stripe price. Caches in Firestore. */
export async function getOrCreateStripeSeatPrice(): Promise<string> {
  const envPrice = getEnvSeatFallback();
  if (envPrice) return envPrice;

  const docId = "seat";
  const db = getAdminFirestore();
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);
  const snap = await docRef.get();

  if (snap.exists) {
    const priceId = snap.data()?.price_id as string | undefined;
    if (priceId) return priceId;
  }

  const stripe = getStripeInstance();

  try {
    const product = await stripe.products.create({
      name: "Extra Seat",
      metadata: { type: "seat" },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 1000, // $10/mo
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { type: "seat" },
    });

    await docRef.set({
      price_id: price.id,
      product_id: product.id,
      type: "seat",
      updated_at: new Date().toISOString(),
    });

    return price.id;
  } catch (err) {
    console.error("[Stripe getOrCreateSeatPrice] Failed to create:", err);
    throw err;
  }
}

const PERSONAL_TEAM_SEAT_LABELS: Record<PersonalTeamSeatAccess, string> = {
  none: "Team seat (base)",
  gallery: "Team seat (Gallery)",
  editor: "Team seat (Editor)",
  fullframe: "Team seat (Full Frame)",
};

/**
 * Personal team seat: recurring price per access tier and billing cycle.
 * Metadata `personal_team_seat_access` is used by webhooks to reconcile quantities.
 */
export async function getOrCreatePersonalTeamSeatPrice(
  level: PersonalTeamSeatAccess,
  billing: BillingCycle
): Promise<string> {
  const envPrice = getEnvPersonalTeamSeatPriceId(level, billing);
  if (envPrice) return envPrice;

  const docId = `team_seat_${level}_${billing}`;
  const db = getAdminFirestore();
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);
  const snap = await docRef.get();

  if (snap.exists) {
    const priceId = snap.data()?.price_id as string | undefined;
    if (priceId) return priceId;
  }

  const amountCents =
    billing === "monthly"
      ? teamSeatMonthlyCentsPerSeat(level)
      : teamSeatAnnualCentsPerSeat(level);
  const interval = billing === "monthly" ? "month" : "year";
  const name = PERSONAL_TEAM_SEAT_LABELS[level];
  const stripe = getStripeInstance();

  try {
    const product = await stripe.products.create({
      name,
      metadata: { personal_team_seat_access: level, type: "personal_team_seat" },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amountCents,
      currency: "usd",
      recurring: { interval },
      metadata: {
        personal_team_seat_access: level,
        type: "personal_team_seat",
        billing,
      },
    });

    await docRef.set({
      price_id: price.id,
      product_id: product.id,
      personal_team_seat_access: level,
      billing,
      updated_at: new Date().toISOString(),
    });

    return price.id;
  } catch (err) {
    console.error("[Stripe getOrCreatePersonalTeamSeatPrice] Failed:", err);
    throw err;
  }
}
