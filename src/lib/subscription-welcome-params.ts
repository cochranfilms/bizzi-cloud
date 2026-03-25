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
  type StorageAddonId,
  VALID_STORAGE_ADDON_IDS,
} from "@/lib/pricing-data";
import {
  formatTeamSeatsSummaryLine,
  resolveTeamSeatCountsForProfile,
  teamSeatMonthlySubtotal,
} from "@/lib/team-seat-pricing";
import type Stripe from "stripe";

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & { price: Stripe.Price };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface SubscriptionWelcomeParams {
  to_email: string;
  greeting_line: string;
  intro_paragraph: string;
  plan_name: string;
  storage_line: string;
  seats_line: string;
  addons_block: string;
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
 * Build subscription welcome email params from subscription + invoice (for invoice.paid webhook).
 * Uses subscription metadata (same as session metadata from checkout) and invoice for amount/email.
 * Pass sessionId for guest checkout URL; null for auth (uses /dashboard).
 */
export function buildSubscriptionWelcomeParamsFromInvoice(
  subscription: Stripe.Subscription,
  invoice: Stripe.Invoice,
  sessionId: string | null,
  baseUrl: string
): SubscriptionWelcomeParams | null {
  const metadata = subscription.metadata ?? {};
  const planId = metadata.planId as string | undefined;
  const addonIdsRaw = metadata.addonIds as string | undefined;
  const billing = (metadata.billing as string) ?? "monthly";
  const userId = metadata.userId as string | undefined;
  const customerName = (metadata.customer_name as string)?.trim?.() || undefined;

  const toEmail =
    (invoice.customer_email as string) ??
    (metadata.customer_email as string)?.trim?.();
  if (!toEmail?.trim()) return null;

  if (!planId || !["solo", "indie", "video", "production"].includes(planId)) return null;

  // Skip plan changes (replace_subscription = existing sub being upgraded)
  if (metadata.replace_subscription) return null;

  const addonIds: string[] = addonIdsRaw ? addonIdsRaw.split(",").filter(Boolean) : [];
  const isGuest = !userId;

  let storageLine = getPlanStorage(planId) + " Encrypted Cloud Storage";
  const subItems = subscription.items.data as SubscriptionItemWithPrice[];
  for (const item of subItems) {
    if (item.deleted) continue;
    const meta = item.price?.metadata;
    const addonId = meta?.storage_addon_id as string | undefined;
    if (addonId) {
      const label = getStorageAddonLabel(addonId);
      if (label) storageLine += ` + ${label}`;
      break;
    }
  }

  const planName = PLAN_LABELS[planId] ?? planId;
  const metaRecord = metadata as Record<string, string | undefined>;
  const teamResolved = resolveTeamSeatCountsForProfile(metaRecord, subItems);
  const seatsLine = formatTeamSeatsSummaryLine(teamResolved);
  const addonParts = addonIds
    .map((id) => {
      const name = ADDON_LABELS[id] ?? id;
      const price = getAddonPrice(id);
      return price > 0 ? `${name} — $${price}/mo` : name;
    })
    .filter(Boolean);
  const addonsLine = addonParts.length > 0 ? addonParts.join(" · ") : undefined;

  let amountStr = "";
  const amountCents = invoice.amount_paid;
  if (typeof amountCents === "number" && amountCents > 0) {
    const isAnnual = billing === "annual";
    amountStr = `$${(amountCents / 100).toFixed(2)}${isAnnual ? "/year" : "/mo"}`;
  }
  if (!amountStr) {
    const tier = storageTiers.find((t) => t.id === planId);
    const planPrice = billing === "annual" ? tier?.annualPrice ?? 0 : tier?.price ?? 0;
    const addonTotal = addonIds.reduce((s, id) => s + getAddonPrice(id), 0);
    const seatExtra = teamSeatMonthlySubtotal(teamResolved);
    const total = planPrice + addonTotal + seatExtra;
    amountStr = billing === "annual" ? `$${total}/year` : `$${total}/mo`;
  }

  const ctaUrl = isGuest && sessionId
    ? `${baseUrl}/account/setup?session_id=${sessionId}`
    : `${baseUrl}/dashboard`;
  const ctaText = isGuest ? "Complete Account Setup" : "Go to Dashboard";
  const introParagraph = isGuest
    ? "Your subscription payment has been received. Complete your account setup below to access your dashboard and start using your storage."
    : "Your subscription payment has been received. Your subscription is now active.";
  const footerParagraph = isGuest
    ? "You'll set your password on the next step. If you already have an account, please sign in."
    : "You can manage your subscription and billing in Settings.";

  const greetingLine = customerName ? `Hello ${escapeHtml(customerName)},` : "Hello,";
  const addonsBlock = addonsLine ? `<p>${escapeHtml(addonsLine)}</p>` : "";

  return {
    to_email: toEmail.trim(),
    greeting_line: greetingLine,
    intro_paragraph: introParagraph,
    plan_name: planName,
    storage_line: storageLine,
    seats_line: seatsLine,
    addons_block: addonsBlock,
    amount: amountStr,
    cta_url: ctaUrl,
    cta_text: ctaText,
    footer_paragraph: footerParagraph,
  };
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
  const userId = metadata.userId as string | undefined;
  const customerName = (metadata.customer_name as string)?.trim?.() || undefined;

  const cust = session.customer;
  const custEmail =
    typeof cust === "object" && cust && "email" in cust ? (cust as Stripe.Customer).email : undefined;
  const toEmail =
    (session.customer_email as string) ??
    (session.customer_details as { email?: string } | null)?.email ??
    (metadata.customer_email as string) ??
    custEmail;
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

  const metaRecord = metadata as Record<string, string | undefined>;
  const subItems = subscription?.items.data as SubscriptionItemWithPrice[] | undefined;
  const teamResolved = resolveTeamSeatCountsForProfile(metaRecord, subItems);
  const seatsLine = formatTeamSeatsSummaryLine(teamResolved);

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
    const seatExtra = teamSeatMonthlySubtotal(teamResolved);
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

  const greetingLine = customerName ? `Hello ${escapeHtml(customerName)},` : "Hello,";
  const addonsBlock = addonsLine ? `<p>${escapeHtml(addonsLine)}</p>` : "";

  return {
    to_email: toEmail.trim(),
    greeting_line: greetingLine,
    intro_paragraph: introParagraph,
    plan_name: planName,
    storage_line: storageLine,
    seats_line: seatsLine,
    addons_block: addonsBlock,
    amount: amountStr,
    cta_url: ctaUrl,
    cta_text: ctaText,
    footer_paragraph: footerParagraph,
  };
}
