/**
 * Build subscription welcome email params from checkout session and subscription.
 * Uses pricing-data for plan/addon labels and amounts.
 */

import {
  PLAN_LABELS,
  ADDON_LABELS,
  STORAGE_ADDON_LABELS,
  storageTiers,
  powerUpAddons,
  SEAT_PRICE,
  type StorageAddonId,
  VALID_STORAGE_ADDON_IDS,
} from "@/lib/pricing-data";
import type Stripe from "stripe";

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & { price: Stripe.Price };

export interface SubscriptionWelcomeParams {
  to_email: string;
  customer_name?: string;
  intro_paragraph: string;
  plan_name: string;
  storage_line: string;
  seats_line: string;
  addons_line?: string;
  amount: string;
  cta_url: string;
  cta_text: string;
  footer_paragraph: string;
}

function getPlanStorage(planId: string): string {
  const tier = storageTiers.find((t) => t.id === planId);
  return tier?.storage ?? "Storage";
}

function getStorageAddonLabel(storageAddonId: string | null): string | null {
  if (!storageAddonId || !VALID_STORAGE_ADDON_IDS.includes(storageAddonId as StorageAddonId))
    return null;
  return STORAGE_ADDON_LABELS[storageAddonId as StorageAddonId] ?? null;
}

function getAddonPrice(addonId: string): number {
  const addon = powerUpAddons.find((a) => a.id === addonId);
  return addon?.price ?? 0;
}

/**
 * Build subscription welcome email params from checkout session.
 * Call from checkout.session.completed for consumer subscriptions.
 */
export function buildSubscriptionWelcomeParams(
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription | null,
  baseUrl: string
): SubscriptionWelcomeParams | null {
  const metadata = session.metadata ?? {};
  const planId = metadata.planId as string | undefined;
  const addonIdsRaw = metadata.addonIds as string | undefined;
  const billing = (metadata.billing as string) ?? "monthly";
  const seatCountRaw = metadata.seat_count;
  const seatCount =
    typeof seatCountRaw === "string" && /^\d+$/.test(seatCountRaw)
      ? parseInt(seatCountRaw, 10)
      : 1;
  const userId = metadata.userId as string | undefined;
  const customerName = (metadata.customer_name as string)?.trim?.() || undefined;

  const toEmail =
    (session.customer_email as string) ??
    (session.customer as Stripe.Customer)?.email ??
    (metadata.customer_email as string);
  if (!toEmail?.trim()) return null;

  if (!planId || !["solo", "indie", "video", "production"].includes(planId)) return null;

  const addonIds: string[] = addonIdsRaw ? addonIdsRaw.split(",").filter(Boolean) : [];
  const isGuest = !userId;

  // Resolve storage from subscription items (includes storage addon if present)
  let storageLine = getPlanStorage(planId) + " Encrypted Cloud Storage";
  let storageAddonLabel: string | null = null;

  if (subscription) {
    const items = subscription.items.data as SubscriptionItemWithPrice[];
    for (const item of items) {
      if (item.deleted) continue;
      const meta = item.price?.metadata;
      const addonId = meta?.storage_addon_id as string | undefined;
      if (addonId) {
        storageAddonLabel = getStorageAddonLabel(addonId);
        break;
      }
    }
  }

  if (storageAddonLabel) {
    storageLine += ` + ${storageAddonLabel}`;
  }

  // Plan name
  const planName = PLAN_LABELS[planId] ?? planId;

  // Seats line
  const seatsLine = seatCount === 1 ? "1 seat" : `${seatCount} seats`;

  // Addons line
  const addonParts = addonIds
    .map((id) => {
      const name = ADDON_LABELS[id] ?? id;
      const price = getAddonPrice(id);
      return price > 0 ? `${name} — $${price}/mo` : name;
    })
    .filter(Boolean);
  const addonsLine = addonParts.length > 0 ? addonParts.join(" · ") : undefined;

  // Amount: use subscription's first invoice or compute from pricing
  let amountStr = "";
  if (subscription?.latest_invoice) {
    const inv = subscription.latest_invoice;
    const amountCents =
      typeof inv === "string" ? undefined : (inv as Stripe.Invoice)?.amount_paid;
    if (typeof amountCents === "number" && amountCents > 0) {
      const isAnnual = billing === "annual";
      amountStr = `$${(amountCents / 100).toFixed(2)}${isAnnual ? "/year" : "/mo"}`;
    }
  }
  if (!amountStr) {
    // Fallback: approximate from plan
    const tier = storageTiers.find((t) => t.id === planId);
    const planPrice = billing === "annual" ? tier?.annualPrice ?? 0 : tier?.price ?? 0;
    const addonTotal = addonIds.reduce((s, id) => s + getAddonPrice(id), 0);
    const seatExtra = Math.max(0, seatCount - 1) * SEAT_PRICE;
    const total = planPrice + addonTotal + seatExtra;
    amountStr = billing === "annual" ? `$${total}/year` : `$${total}/mo`;
  }

  const ctaUrl = isGuest
    ? `${baseUrl}/account/setup?session_id=${session.id}`
    : `${baseUrl}/dashboard`;
  const ctaText = isGuest ? "Complete Account Setup" : "Go to Dashboard";
  const introParagraph = isGuest
    ? "Your subscription payment has been received. Complete your account setup below to access your dashboard and start using your storage."
    : "Your subscription payment has been received. Your subscription is now active.";
  const footerParagraph = isGuest
    ? "You'll set your password on the next step. If you already have an account, please sign in."
    : "You can manage your subscription and billing in Settings.";

  return {
    to_email: toEmail.trim(),
    customer_name: customerName,
    intro_paragraph: introParagraph,
    plan_name: planName,
    storage_line: storageLine,
    seats_line: seatsLine,
    addons_line: addonsLine,
    amount: amountStr,
    cta_url: ctaUrl,
    cta_text: ctaText,
    footer_paragraph: footerParagraph,
  };
}
