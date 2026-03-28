/**
 * Shared itemized subscription receipt (EmailJS) for Stripe invoices.
 * Used after in-app subscription updates and after Checkout (invoice.paid).
 */
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { sendSubscriptionChangeReceiptEmail } from "@/lib/emailjs";
import { getStripeInstance } from "@/lib/stripe";
import type Stripe from "stripe";
import {
  buildSubscriptionLineItemsHtml,
  buildSubscriptionLineItemsPlain,
  buildSubscriptionReceiptDisplay,
  lineItemsFromStripeInvoice,
  type SubscriptionReceiptSource,
} from "@/lib/stripe-subscription-line-items";

export type { SubscriptionReceiptSource } from "@/lib/stripe-subscription-line-items";

function manageBillingSettingsUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? (typeof process.env.VERCEL_URL === "string" ? `https://${process.env.VERCEL_URL}` : "https://www.bizzicloud.io")}/dashboard/settings`;
}

/**
 * Consumer billing receipts must go to the Firebase account that owns the subscription (team admin),
 * not necessarily Stripe's customer_email (often a seat member's address).
 *
 * Priority: subscription.metadata.userId → API caller uid → Firestore profile by subscription id → Stripe email.
 */
type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

async function resolveSubscriptionReceiptRecipientEmail(
  invoice: Stripe.Invoice,
  callerUid: string
): Promise<string | null> {
  const stripe = getStripeInstance();

  let subscription: Stripe.Subscription | null = null;
  const rawSub = (invoice as InvoiceWithSubscription).subscription;
  if (typeof rawSub === "string") {
    try {
      subscription = await stripe.subscriptions.retrieve(rawSub);
    } catch {
      subscription = null;
    }
  } else if (rawSub && typeof rawSub === "object") {
    const s = rawSub as Stripe.Subscription & { deleted?: boolean };
    if (!s.deleted) subscription = s;
  }

  const metaUid =
    typeof subscription?.metadata?.userId === "string" ? subscription.metadata.userId.trim() : "";
  const uidsToTry = [...new Set([metaUid, callerUid].filter(Boolean))];

  for (const uid of uidsToTry) {
    const user = await getAdminAuth().getUser(uid).catch(() => null);
    const email = user?.email?.trim();
    if (email) return email;
  }

  const subId =
    subscription?.id ?? (typeof rawSub === "string" ? rawSub : null);
  if (subId) {
    const ownerUid = await findConsumerProfileUidByStripeSubscriptionId(subId);
    if (ownerUid) {
      const user = await getAdminAuth().getUser(ownerUid).catch(() => null);
      const email = user?.email?.trim();
      if (email) return email;
    }
  }

  const fromInvoice = invoice.customer_email?.trim();
  if (fromInvoice) return fromInvoice;
  const cust = invoice.customer;
  if (cust && typeof cust === "object") {
    const c = cust as Stripe.Customer & { deleted?: boolean };
    if (!c.deleted) {
      const fromCustomer = c.email?.trim();
      if (fromCustomer) return fromCustomer;
    }
  }

  return null;
}

async function findConsumerProfileUidByStripeSubscriptionId(
  subscriptionId: string
): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("profiles")
    .where("stripe_subscription_id", "==", subscriptionId)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;

  return null;
}

/**
 * Loads invoice lines, resolves customer email from Firebase Auth, sends EmailJS receipt.
 * No-op if recipient has no email. Requires EMAILJS_TEMPLATE_ID_SUBSCRIPTION_CHANGE_RECEIPT.
 */
export async function sendSubscriptionReceiptForInvoiceId(options: {
  uid: string;
  invoiceId: string;
  changeSummary: string;
  source: SubscriptionReceiptSource;
}): Promise<void> {
  const stripe = getStripeInstance();
  const receiptInvoice = await stripe.invoices.retrieve(options.invoiceId, {
    expand: ["lines.data", "customer", "subscription"],
  });
  const toEmail = await resolveSubscriptionReceiptRecipientEmail(receiptInvoice, options.uid);
  if (!toEmail) {
    console.warn(
      "[subscription receipt] skipped: no billing recipient email for invoice",
      options.invoiceId,
      "uid",
      options.uid
    );
    return;
  }

  const lineRows = lineItemsFromStripeInvoice(receiptInvoice);
  const lineItemsHtml = buildSubscriptionLineItemsHtml(lineRows);
  const lineItemsPlain = buildSubscriptionLineItemsPlain(lineRows);
  const display = buildSubscriptionReceiptDisplay(receiptInvoice, options.changeSummary, options.source);

  await sendSubscriptionChangeReceiptEmail({
    to_email: toEmail,
    change_summary: display.changeSummary,
    line_items_plain: lineItemsPlain,
    line_items_html: lineItemsHtml,
    total_amount: display.totalAmount,
    amount_status_line: display.amountStatusLine,
    proration_note: display.prorationNote,
    invoice_id: display.invoiceId,
    manage_billing_url: manageBillingSettingsUrl(),
  });
}
