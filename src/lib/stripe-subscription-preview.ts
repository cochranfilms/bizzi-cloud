/**
 * Preview prorated amount for a subscription change.
 * Uses Stripe's invoices.createPreview API for exact proration.
 */
import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
  getOrCreateStripeStorageAddonPrice,
  getOrCreatePersonalTeamSeatPrice,
} from "@/lib/stripe-prices";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import type { StorageAddonId } from "@/lib/pricing-data";
import { VALID_STORAGE_ADDON_IDS } from "@/lib/pricing-data";
import type { PersonalTeamSeatAccess, TeamSeatCounts } from "@/lib/team-seat-pricing";
import {
  clampTeamSeatCounts,
  coerceTeamSeatCounts,
  emptyTeamSeatCounts,
  PERSONAL_TEAM_SEAT_ACCESS_LEVELS,
} from "@/lib/team-seat-pricing";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  getResolvedStorageAddonIdFromItem,
  subscriptionItemIsAdditionalStorage,
} from "@/lib/stripe-storage-from-subscription";
import { lineItemsFromStripeInvoice } from "@/lib/stripe-subscription-line-items";

const VALID_PLAN_IDS = ["solo", "indie", "video", "production"];
const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"];
const STORAGE_ADDON_PLAN_MAP: Record<string, "indie" | "video"> = {
  indie_1: "indie", indie_2: "indie", indie_3: "indie",
  video_1: "video", video_2: "video", video_3: "video", video_4: "video", video_5: "video",
};

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & {
  price: Stripe.Price;
};

function isAddonItem(item: SubscriptionItemWithPrice): boolean {
  return !!item.price?.metadata?.addon_id;
}

function getAddonIdFromItem(item: SubscriptionItemWithPrice): string | null {
  const id = item.price?.metadata?.addon_id;
  return typeof id === "string" && VALID_ADDON_IDS.includes(id) ? id : null;
}

function isStorageAddonItem(item: SubscriptionItemWithPrice): boolean {
  return !!item.price?.metadata?.storage_addon_plan;
}

function getStorageAddonIdFromItem(item: SubscriptionItemWithPrice): string | null {
  const id = item.price?.metadata?.storage_addon_id;
  return typeof id === "string" && VALID_STORAGE_ADDON_IDS.includes(id as StorageAddonId) ? id : null;
}

function isTeamSeatItem(item: SubscriptionItemWithPrice): boolean {
  const meta = item.price?.metadata;
  if (!meta) return false;
  if (meta.personal_team_seat_access) return true;
  if (meta.type === "seat" || meta.type === "personal_team_seat") return true;
  return false;
}

function isPlanItem(item: SubscriptionItemWithPrice): boolean {
  const meta = item.price?.metadata;
  if (meta?.addon_id) return false;
  if (meta?.storage_addon_plan) return false;
  if (meta?.personal_team_seat_access || meta?.type === "seat" || meta?.type === "personal_team_seat")
    return false;
  if (meta?.plan_id) return true;
  const interval = item.price?.recurring?.interval;
  return interval === "month" || interval === "year";
}

export type SubscriptionPreviewInput = {
  uid: string;
  planId: string;
  addonIds: AddonId[];
  billing: BillingCycle;
  storageAddonId?: string | null;
  /** When omitted, uses profile.team_seat_counts */
  teamSeatCounts?: Partial<TeamSeatCounts> | null;
};

export async function getSubscriptionPreview(
  input: SubscriptionPreviewInput
): Promise<NextResponse> {
  const { uid, planId, addonIds, storageAddonId, teamSeatCounts: teamSeatBody } = input;

  if (!planId || !VALID_PLAN_IDS.includes(planId)) {
    return NextResponse.json(
      { error: "Invalid or missing planId" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profile = profileSnap.data() as Record<string, unknown> | undefined;
  const rawSub = profile?.stripe_subscription_id;
  const stripeSubscriptionId =
    typeof rawSub === "string" ? rawSub : (rawSub as { id?: string } | null)?.id ?? undefined;

  if (!stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price.product"],
    });
  } catch (err) {
    console.error("[Stripe subscription-preview] Failed to retrieve:", err);
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }

  const items = subscription.items.data as SubscriptionItemWithPrice[];
  let planItem: SubscriptionItemWithPrice | null = null;
  const addonItems: SubscriptionItemWithPrice[] = [];
  const storageAddonItems: SubscriptionItemWithPrice[] = [];

  for (const item of items) {
    if (item.deleted) continue;
    if (isAddonItem(item)) {
      addonItems.push(item);
    } else if (isStorageAddonItem(item) || subscriptionItemIsAdditionalStorage(item)) {
      storageAddonItems.push(item);
    } else if (isPlanItem(item)) {
      planItem = item;
    }
  }

  if (!planItem) {
    return NextResponse.json(
      { error: "Could not identify plan in subscription" },
      { status: 500 }
    );
  }

  const currentBilling: BillingCycle =
    planItem.price?.recurring?.interval === "year" ? "annual" : "monthly";
  const billingToUse = input.billing || currentBilling;

  let newPlanPriceId: string;
  try {
    newPlanPriceId = await getOrCreateStripePrice(
      planId as Exclude<PlanId, "free">,
      billingToUse
    );
  } catch (err) {
    console.error("[Stripe subscription-preview] Failed to get plan price:", err);
    return NextResponse.json(
      { error: "Failed to preview" },
      { status: 500 }
    );
  }

  const subscriptionDetailsItems: Stripe.InvoiceCreatePreviewParams.SubscriptionDetails.Item[] = [
    { id: planItem.id, price: newPlanPriceId },
  ];

  const existingAddonIds = new Set(
    addonItems.map(getAddonIdFromItem).filter((id): id is string => Boolean(id))
  );
  const targetAddonIds = new Set(addonIds);

  for (const item of addonItems) {
    const addonId = getAddonIdFromItem(item);
    if (!addonId) continue;
    if (targetAddonIds.has(addonId as AddonId)) {
      subscriptionDetailsItems.push({ id: item.id });
    } else {
      subscriptionDetailsItems.push({ id: item.id, deleted: true });
    }
  }

  for (const addonId of targetAddonIds) {
    if (!existingAddonIds.has(addonId)) {
      try {
        const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
        subscriptionDetailsItems.push({ price: addonPriceId, quantity: 1 });
      } catch (err) {
        console.error("[Stripe subscription-preview] Failed to get addon price:", err);
        return NextResponse.json(
          { error: "Failed to preview" },
          { status: 500 }
        );
      }
    }
  }

  const targetStorageAddonId =
    (planId === "indie" || planId === "video") && storageAddonId && VALID_STORAGE_ADDON_IDS.includes(storageAddonId as StorageAddonId)
      ? (STORAGE_ADDON_PLAN_MAP[storageAddonId] === planId ? storageAddonId : null)
      : null;

  const currentStorageAddonId =
    storageAddonItems.length > 0
      ? getResolvedStorageAddonIdFromItem(planId as PlanId, storageAddonItems[0]) ??
        getStorageAddonIdFromItem(storageAddonItems[0])
      : null;
  if (currentStorageAddonId !== targetStorageAddonId) {
    for (const item of storageAddonItems) {
      subscriptionDetailsItems.push({ id: item.id, deleted: true });
    }
    if (targetStorageAddonId) {
      try {
        const storageAddonPriceId = await getOrCreateStripeStorageAddonPrice(targetStorageAddonId as StorageAddonId);
        subscriptionDetailsItems.push({ price: storageAddonPriceId, quantity: 1 });
      } catch (err) {
        console.error("[Stripe subscription-preview] Failed to get storage addon price:", err);
        return NextResponse.json(
          { error: "Failed to preview" },
          { status: 500 }
        );
      }
    }
  }

  const allowsTeamSeats = ["indie", "video", "production"].includes(planId);
  let targetTeamCounts: TeamSeatCounts = emptyTeamSeatCounts();
  if (allowsTeamSeats) {
    const fromProfile = profile?.team_seat_counts as TeamSeatCounts | undefined;
    targetTeamCounts = clampTeamSeatCounts(
      coerceTeamSeatCounts(teamSeatBody ?? fromProfile ?? {})
    );
  }
  for (const item of items) {
    if (item.deleted) continue;
    if (isTeamSeatItem(item as SubscriptionItemWithPrice)) {
      subscriptionDetailsItems.push({ id: item.id, deleted: true });
    }
  }
  if (allowsTeamSeats) {
    for (const tier of PERSONAL_TEAM_SEAT_ACCESS_LEVELS) {
      const qty = targetTeamCounts[tier as PersonalTeamSeatAccess];
      if (qty <= 0) continue;
      try {
        const priceId = await getOrCreatePersonalTeamSeatPrice(tier, billingToUse);
        subscriptionDetailsItems.push({ price: priceId, quantity: qty });
      } catch (err) {
        console.error("[Stripe subscription-preview] Team seat price failed:", tier, err);
        return NextResponse.json({ error: "Failed to preview" }, { status: 500 });
      }
    }
  }

  try {
    const invoice = await stripe.invoices.createPreview({
      subscription: stripeSubscriptionId,
      subscription_details: {
        items: subscriptionDetailsItems,
        proration_behavior: "always_invoice",
      },
    });

    const amountDue = invoice.amount_due ?? 0;
    const isCredit = amountDue < 0;
    const lineItems = lineItemsFromStripeInvoice(invoice);
    const taxCentsFromInvoice =
      invoice.total_taxes && invoice.total_taxes.length > 0
        ? invoice.total_taxes.reduce((sum, t) => sum + t.amount, 0)
        : null;

    return NextResponse.json({
      amountDueCents: Math.abs(amountDue),
      isCredit,
      currency: invoice.currency ?? "usd",
      lineItems,
      subtotalCents: invoice.subtotal ?? null,
      taxCents: taxCentsFromInvoice,
      totalCents: invoice.total ?? null,
    });
  } catch (err) {
    console.error("[Stripe subscription-preview] Failed to create preview:", err);
    return NextResponse.json(
      { error: "Failed to calculate preview" },
      { status: 500 }
    );
  }
}
