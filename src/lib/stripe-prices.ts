/**
 * Dynamically create Stripe Products and Prices on first use.
 * Caches price IDs in Firestore so no manual env vars are needed.
 * Falls back to env vars (STRIPE_PRICE_*) if set, for backward compatibility.
 */

import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import {
  getStripePriceId as getEnvPriceId,
  getStripeAddonPriceId as getEnvAddonPriceId,
} from "@/lib/plan-constants";

const FIRESTORE_COLLECTION = "stripe_prices";

/** Plan pricing: [monthly cents, annual cents] */
const PLAN_PRICING: Record<Exclude<PlanId, "free">, { name: string; monthly: number; annual: number }> = {
  solo: { name: "Solo Creator", monthly: 1200, annual: 10800 },
  indie: { name: "Indie Filmmaker", monthly: 2000, annual: 18000 },
  video: { name: "Video Pro", monthly: 3500, annual: 31500 },
  production: { name: "Production House", monthly: 7000, annual: 63000 },
};

/** Addon pricing: monthly cents */
const ADDON_PRICING: Record<AddonId, { name: string; monthly: number }> = {
  gallery: { name: "Bizzi Gallery Suite", monthly: 500 },
  editor: { name: "Bizzi Editor", monthly: 800 },
  fullframe: { name: "Bizzi Full Frame", monthly: 1000 },
};

/** Get price ID from env if set (backward compat) */
function getEnvFallback(planId: Exclude<PlanId, "free">, billing: BillingCycle): string | null {
  return getEnvPriceId(planId, billing);
}

function getEnvAddonFallback(addonId: AddonId): string | null {
  return getEnvAddonPriceId(addonId);
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
 */
export async function getOrCreateStripeAddonPrice(addonId: AddonId): Promise<string> {
  const envPrice = getEnvAddonFallback(addonId);
  if (envPrice) return envPrice;

  const docId = `addon_${addonId}`;
  const db = getAdminFirestore();
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);
  const snap = await docRef.get();

  if (snap.exists) {
    const priceId = snap.data()?.price_id as string | undefined;
    if (priceId) return priceId;
  }

  const pricing = ADDON_PRICING[addonId];
  if (!pricing) throw new Error(`Unknown addon: ${addonId}`);

  const stripe = getStripeInstance();

  try {
    const product = await stripe.products.create({
      name: pricing.name,
      metadata: { addon_id: addonId },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pricing.monthly,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { addon_id: addonId },
    });

    await docRef.set({
      price_id: price.id,
      product_id: product.id,
      addon_id: addonId,
      updated_at: new Date().toISOString(),
    });

    return price.id;
  } catch (err) {
    console.error("[Stripe getOrCreateAddonPrice] Failed to create:", err);
    throw err;
  }
}
