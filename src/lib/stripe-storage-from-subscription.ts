/**
 * Derive additional storage (TB) and internal storage add-on id from Stripe subscription items.
 * App-created prices include metadata; portal/dashboard-created prices may only have a product name
 * like "Additional Storage +4 TB (Video Pro)" — we infer TB and map to a known addon id when possible.
 */

import type Stripe from "stripe";
import { getStorageBytesForPlan, type PlanId } from "@/lib/plan-constants";
import {
  STORAGE_ADDONS,
  STORAGE_ADDON_TB,
  type StorageAddonId,
  VALID_STORAGE_ADDON_IDS,
} from "@/lib/pricing-data";

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & { price: Stripe.Price };

/** Prefer explicit "+N TB" (invoice / product naming). */
export function parseTbFromStorageProductText(text: string | null | undefined): number {
  if (!text || typeof text !== "string") return 0;
  const plus = /\+\s*(\d+)\s*TB\b/i.exec(text.trim());
  if (plus) {
    const n = parseInt(plus[1], 10);
    return !isNaN(n) && n > 0 ? n : 0;
  }
  return 0;
}

function getExpandedProduct(price: Stripe.Price): Stripe.Product | null {
  const p = price.product;
  if (typeof p === "string") return null;
  if (!p) return null;
  if ("deleted" in p && (p as Stripe.DeletedProduct).deleted) return null;
  return p as Stripe.Product;
}

function isExcludedStripeLineItem(price: Stripe.Price): boolean {
  const m = price.metadata ?? {};
  if (m.plan_id) return true;
  if (m.addon_id) return true;
  if (m.personal_team_seat_access) return true;
  if (m.type === "seat" || m.type === "personal_team_seat") return true;
  if (m.enterprise_storage_tier) return true;
  return false;
}

function normalizeStorageMeta(
  meta: Stripe.Metadata | null | undefined
): { id: string | null; tb: number } {
  if (!meta) return { id: null, tb: 0 };
  const idRaw = meta.storage_addon_id;
  const id =
    typeof idRaw === "string" &&
    idRaw.trim() &&
    VALID_STORAGE_ADDON_IDS.includes(idRaw.trim() as StorageAddonId)
      ? idRaw.trim()
      : null;
  const tbRaw = meta.storage_addon_tb;
  let tb = 0;
  if (tbRaw !== undefined && tbRaw !== null && String(tbRaw).trim() !== "") {
    const p = parseInt(String(tbRaw), 10);
    tb = !isNaN(p) && p > 0 ? p : 0;
  }
  if (id && tb === 0) {
    tb = STORAGE_ADDON_TB[id as StorageAddonId] ?? 0;
  }
  return { id, tb };
}

function resolveStorageAddonIdForPlan(planId: PlanId, tb: number): string | null {
  if (planId === "indie") {
    return STORAGE_ADDONS.indie.find((a) => a.tb === tb)?.id ?? null;
  }
  if (planId === "video") {
    return STORAGE_ADDONS.video.find((a) => a.tb === tb)?.id ?? null;
  }
  return null;
}

function inferTbAndIdFromNameHeuristic(
  planId: PlanId,
  price: Stripe.Price
): { tb: number; id: string | null } {
  const product = getExpandedProduct(price);
  const texts = [product?.name, price.nickname].filter(Boolean) as string[];
  for (const text of texts) {
    if (!/additional\s*storage/i.test(text)) continue;
    const tb = parseTbFromStorageProductText(text);
    if (tb > 0) {
      return { tb, id: resolveStorageAddonIdForPlan(planId, tb) };
    }
  }
  return { tb: 0, id: null };
}

/**
 * Per-line contribution toward additional storage (already multiplied by item quantity).
 */
export function getStorageContributionFromSubscriptionItem(
  planId: PlanId,
  item: Stripe.SubscriptionItem & { price?: Stripe.Price }
): { tb: number; storageAddonId: string | null } | null {
  if (item.deleted || !item.price) return null;
  const price = item.price;
  if (isExcludedStripeLineItem(price)) return null;

  let tb = 0;
  let storageAddonId: string | null = null;

  const fromPriceMeta = normalizeStorageMeta(price.metadata);
  if (fromPriceMeta.tb > 0 || fromPriceMeta.id) {
    tb = fromPriceMeta.tb;
    storageAddonId =
      fromPriceMeta.id ??
      (tb > 0 ? resolveStorageAddonIdForPlan(planId, tb) : null);
  }

  if (tb <= 0) {
    const product = getExpandedProduct(price);
    const fromProductMeta = normalizeStorageMeta(product?.metadata);
    if (fromProductMeta.tb > 0 || fromProductMeta.id) {
      tb = fromProductMeta.tb;
      storageAddonId =
        fromProductMeta.id ??
        (tb > 0 ? resolveStorageAddonIdForPlan(planId, tb) : null);
    }
  }

  if (tb <= 0) {
    const inferred = inferTbAndIdFromNameHeuristic(planId, price);
    tb = inferred.tb;
    storageAddonId = inferred.id;
  }

  if (tb <= 0) return null;

  const q = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
  return { tb: tb * q, storageAddonId };
}

/** Same as metadata-only lookup, plus name/metadata inference (for portal-created prices). */
export function getResolvedStorageAddonIdFromItem(
  planId: PlanId,
  item: Stripe.SubscriptionItem & { price?: Stripe.Price }
): string | null {
  const c = getStorageContributionFromSubscriptionItem(planId, item);
  return c?.storageAddonId ?? null;
}

/** True if this line should be treated as an “additional storage” subscription item (not base plan, seats, etc.). */
export function subscriptionItemIsAdditionalStorage(
  item: Stripe.SubscriptionItem & { price?: Stripe.Price }
): boolean {
  if (item.deleted || !item.price) return false;
  const price = item.price;
  if (isExcludedStripeLineItem(price)) return false;
  const fromPriceMeta = normalizeStorageMeta(price.metadata);
  if (fromPriceMeta.tb > 0 || fromPriceMeta.id) return true;
  const product = getExpandedProduct(price);
  const fromProductMeta = normalizeStorageMeta(product?.metadata);
  if (fromProductMeta.tb > 0 || fromProductMeta.id) return true;
  const texts = [product?.name, price.nickname].filter(Boolean) as string[];
  for (const text of texts) {
    if (/additional\s*storage/i.test(text) && parseTbFromStorageProductText(text) > 0) return true;
  }
  return false;
}

export function computeStorageFromSubscription(
  planId: PlanId,
  items: SubscriptionItemWithPrice[]
): { storageQuotaBytes: number; storageAddonId: string | null } {
  let storageAddonTb = 0;
  let storageAddonId: string | null = null;
  for (const item of items) {
    const contrib = getStorageContributionFromSubscriptionItem(planId, item);
    if (!contrib) continue;
    storageAddonTb += contrib.tb;
    if (contrib.storageAddonId) storageAddonId = contrib.storageAddonId;
  }
  const baseBytes = getStorageBytesForPlan(planId);
  const addonBytes = storageAddonTb * 1024 ** 4;
  return {
    storageQuotaBytes: baseBytes + addonBytes,
    storageAddonId,
  };
}
