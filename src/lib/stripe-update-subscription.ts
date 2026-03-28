/**
 * Update existing Stripe subscription with proration.
 * Applies credit for unused time on current plan/addons and charges only the difference.
 */
import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { sendSubscriptionReceiptForInvoiceId } from "@/lib/send-subscription-change-receipt";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
  getOrCreateStripeStorageAddonPrice,
  getOrCreatePersonalTeamSeatPrice,
} from "@/lib/stripe-prices";
import type { TeamSeatCounts, PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import {
  clampTeamSeatCounts,
  coerceTeamSeatCounts,
  emptyTeamSeatCounts,
  PERSONAL_TEAM_SEAT_ACCESS_LEVELS,
  teamSeatCountsToMetadataStrings,
} from "@/lib/team-seat-pricing";
import { countUsedSeatsForTier } from "@/lib/personal-team";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import type { StorageAddonId } from "@/lib/pricing-data";
import { VALID_STORAGE_ADDON_IDS } from "@/lib/pricing-data";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  getResolvedStorageAddonIdFromItem,
  subscriptionItemIsAdditionalStorage,
} from "@/lib/stripe-storage-from-subscription";
import {
  buildSubscriptionReceiptDisplay,
  type SubscriptionReceiptDisplay,
} from "@/lib/stripe-subscription-line-items";

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

export type UpdateSubscriptionInput = {
  uid: string;
  planId: string;
  addonIds: AddonId[];
  billing: BillingCycle;
  storageAddonId?: string | null;
  /** When omitted, uses profile.team_seat_counts */
  teamSeatCounts?: Partial<TeamSeatCounts> | null;
};

export async function updateSubscriptionWithProration(
  input: UpdateSubscriptionInput
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
  const profile = profileSnap.data();
  const rawSub = profile?.stripe_subscription_id;
  const stripeSubscriptionId =
    typeof rawSub === "string" ? rawSub : (rawSub as { id?: string } | null)?.id ?? undefined;

  if (!stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription. Sync from Stripe or upgrade first." },
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
    console.error("[Stripe update-subscription] Failed to retrieve:", err);
    return NextResponse.json(
      { error: "Failed to load subscription", code: "SUBSCRIPTION_LOAD_FAILED" },
      { status: 500 }
    );
  }

  const items = subscription.items.data as SubscriptionItemWithPrice[];
  let planItem: SubscriptionItemWithPrice | null = null;
  const addonItems: SubscriptionItemWithPrice[] = [];
  const storageAddonItems: SubscriptionItemWithPrice[] = [];

  for (const item of items) {
    if (item.deleted) continue;
    if (isTeamSeatItem(item)) {
      continue;
    }
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
      { error: "Could not identify plan in subscription", code: "PLAN_NOT_FOUND" },
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
    console.error("[Stripe update-subscription] Failed to get plan price:", err);
    return NextResponse.json(
      { error: "Failed to update. Please try again.", code: "PLAN_PRICE_FAILED" },
      { status: 500 }
    );
  }

  const itemsToUpdate: Stripe.SubscriptionUpdateParams.Item[] = [
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
      itemsToUpdate.push({ id: item.id });
    } else {
      itemsToUpdate.push({ id: item.id, deleted: true });
    }
  }

  for (const addonId of targetAddonIds) {
    if (!existingAddonIds.has(addonId)) {
      try {
        const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
        itemsToUpdate.push({ price: addonPriceId, quantity: 1 });
      } catch (err) {
        console.error("[Stripe update-subscription] Failed to get addon price:", err);
        return NextResponse.json(
          { error: "Failed to update. Please try again.", code: "ADDON_PRICE_FAILED" },
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
      itemsToUpdate.push({ id: item.id, deleted: true });
    }
    if (targetStorageAddonId) {
      try {
        const storageAddonPriceId = await getOrCreateStripeStorageAddonPrice(targetStorageAddonId as StorageAddonId);
        itemsToUpdate.push({ price: storageAddonPriceId, quantity: 1 });
      } catch (err) {
        console.error("[Stripe update-subscription] Failed to get storage addon price:", err);
        return NextResponse.json(
          { error: "Failed to update. Please try again.", code: "STORAGE_ADDON_PRICE_FAILED" },
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
    if (isTeamSeatItem(item)) {
      itemsToUpdate.push({ id: item.id, deleted: true });
    }
  }
  if (allowsTeamSeats) {
    for (const tier of PERSONAL_TEAM_SEAT_ACCESS_LEVELS) {
      const used = await countUsedSeatsForTier(uid, tier);
      if (used > targetTeamCounts[tier]) {
        return NextResponse.json(
          {
            error:
              "Cannot reduce team seats below assigned members. Remove or reassign members in Team settings first.",
            code: "TEAM_SEATS_ASSIGNED",
          },
          { status: 400 }
        );
      }
    }
    const tierOrder: PersonalTeamSeatAccess[] = ["none", "gallery", "editor", "fullframe"];
    for (const tier of tierOrder) {
      const qty = targetTeamCounts[tier];
      if (qty <= 0) continue;
      try {
        const priceId = await getOrCreatePersonalTeamSeatPrice(tier, billingToUse);
        itemsToUpdate.push({ price: priceId, quantity: qty });
      } catch (err) {
        console.error("[Stripe update-subscription] Team seat price failed:", tier, err);
        return NextResponse.json(
          { error: "Failed to update. Please try again.", code: "TEAM_SEAT_PRICE_FAILED" },
          { status: 500 }
        );
      }
    }
  }

  const prevMeta = subscription.metadata ?? {};
  const teamMeta = teamSeatCountsToMetadataStrings(targetTeamCounts);
  const mergedMetadata: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(prevMeta).filter(([, v]) => typeof v === "string")
    ) as Record<string, string>,
    userId: uid,
    planId,
    addonIds: addonIds.join(","),
    billing: billingToUse,
    seat_count: teamMeta.seat_count,
    team_seats_none: teamMeta.team_seats_none,
    team_seats_gallery: teamMeta.team_seats_gallery,
    team_seats_editor: teamMeta.team_seats_editor,
    team_seats_fullframe: teamMeta.team_seats_fullframe,
    ...(targetStorageAddonId ? { storageAddonId: targetStorageAddonId } : {}),
  };
  if (!targetStorageAddonId) {
    delete mergedMetadata.storageAddonId;
  }

  try {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      items: itemsToUpdate,
      metadata: mergedMetadata,
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    console.error("[Stripe update-subscription]", err);
    const paymentFailed = isStripePaymentFailure(err);
    return NextResponse.json(
      {
        error: paymentFailed
          ? paymentFailureUserMessage(err)
          : msg.includes("payment")
            ? "Payment failed. Update your payment method in billing settings and try again."
            : msg,
        code: paymentFailed ? "PAYMENT_FAILED" : undefined,
        updatePaymentMethod:
          paymentFailed
            ? "Open Billing portal from Settings to add or replace your card, then try Apply changes again."
            : undefined,
      },
      { status: 400 }
    );
  }

  let updatedSubscription: Stripe.Subscription;
  try {
    updatedSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["latest_invoice.lines.data", "latest_invoice.customer"],
    });
  } catch (e) {
    console.error("[Stripe update-subscription] retrieve after update:", e);
    try {
      updatedSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    } catch (e2) {
      console.error("[Stripe update-subscription] subscription retrieve retry:", e2);
      return NextResponse.json({ ok: true });
    }
  }

  const li = updatedSubscription.latest_invoice;
  const expandedInv =
    li && typeof li === "object" ? (li as Stripe.Invoice) : null;
  const invId = typeof li === "string" ? li : expandedInv?.id ?? null;
  const changeSummary = `Plan: ${planId} · Billing: ${billingToUse}`;

  let receipt: SubscriptionReceiptDisplay | undefined;
  if (expandedInv) {
    try {
      receipt = buildSubscriptionReceiptDisplay(expandedInv, changeSummary, "subscription_update");
    } catch (e) {
      console.error("[Stripe update-subscription] receipt from expanded invoice:", e);
    }
  }
  if (!receipt && invId) {
    try {
      const fullInvoice = await stripe.invoices.retrieve(invId, {
        expand: ["lines.data", "customer", "subscription"],
      });
      receipt = buildSubscriptionReceiptDisplay(fullInvoice, changeSummary, "subscription_update");
    } catch (e) {
      console.error("[Stripe update-subscription] in-app receipt invoice retrieve:", e);
    }
  }

  if (invId) {
    void sendSubscriptionReceiptForInvoiceId({
      uid,
      invoiceId: invId,
      changeSummary,
      source: "subscription_update",
      subscriptionId: stripeSubscriptionId,
    }).catch((e) => console.error("[Stripe update-subscription] receipt email:", e));
  }

  return NextResponse.json(receipt ? { ok: true, receipt } : { ok: true });
}

function isStripePaymentFailure(err: unknown): boolean {
  if (err instanceof Stripe.errors.StripeCardError) return true;
  if (typeof err === "object" && err !== null && "type" in err) {
    if ((err as { type?: string }).type === "StripeCardError") return true;
  }
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = String((err as { code?: string }).code ?? "");
    if (
      [
        "card_declined",
        "expired_card",
        "incorrect_cvc",
        "processing_error",
        "incorrect_number",
        "insufficient_funds",
      ].includes(code)
    ) {
      return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(declined|card does not support|try again in|payment method|Your card)\b/i.test(msg);
}

function paymentFailureUserMessage(err: unknown): string {
  if (err instanceof Stripe.errors.StripeCardError) {
    return err.message;
  }
  if (err instanceof Error && err.message.length > 0 && err.message.length < 400) {
    return err.message;
  }
  return "Your payment could not be processed. Update your card in Billing settings and try again.";
}
