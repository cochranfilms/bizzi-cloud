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
 * Receipt recipient order (aligns with Stripe charge.succeeded payer / cardholder):
 * 1. Payment charge billing_details.email (e.g. info@… on the Visa that paid)
 * 2. invoice.customer_email, Stripe Customer.email
 * 3. Firebase: checkout = metadata.userId then caller; in-app = caller then metadata; Firestore profile by sub id
 *
 * `knownSubscriptionId` loads subscription metadata when invoice omits `subscription`.
 */
type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
  charge?: string | Stripe.Charge | null;
};

function emailFromStripeCharge(ch: Stripe.Charge | null | undefined): string | null {
  const em = ch?.billing_details?.email?.trim();
  return em || null;
}

/** Email typed on the payment method for this invoice — matches Dashboard charge.succeeded. */
async function extractPayerEmailFromInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<string | null> {
  const piRaw = (invoice as InvoiceWithSubscription).payment_intent;
  if (piRaw && typeof piRaw === "object") {
    const pi = piRaw as Stripe.PaymentIntent;
    const lc = pi.latest_charge;
    if (lc && typeof lc === "object") {
      const e = emailFromStripeCharge(lc as Stripe.Charge);
      if (e) return e;
    }
    if (typeof lc === "string" && lc.length > 0) {
      try {
        const ch = await stripe.charges.retrieve(lc);
        const e = emailFromStripeCharge(ch);
        if (e) return e;
      } catch {
        /* ignore */
      }
    }
  }
  if (typeof piRaw === "string" && piRaw.length > 0) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piRaw, { expand: ["latest_charge"] });
      const e = emailFromStripeCharge(
        typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null
      );
      if (e) return e;
      if (typeof pi.latest_charge === "string") {
        const ch = await stripe.charges.retrieve(pi.latest_charge);
        const e2 = emailFromStripeCharge(ch);
        if (e2) return e2;
      }
    } catch {
      /* ignore */
    }
  }

  const legacy = (invoice as InvoiceWithSubscription).charge;
  if (legacy && typeof legacy === "object") {
    const e = emailFromStripeCharge(legacy as Stripe.Charge);
    if (e) return e;
  }
  if (typeof legacy === "string") {
    try {
      const ch = await stripe.charges.retrieve(legacy);
      return emailFromStripeCharge(ch);
    } catch {
      /* ignore */
    }
  }

  return null;
}

async function resolveSubscriptionReceiptRecipientEmail(params: {
  invoice: Stripe.Invoice;
  callerUid: string;
  source: SubscriptionReceiptSource;
  knownSubscriptionId?: string | null;
}): Promise<string | null> {
  const { invoice, callerUid, source, knownSubscriptionId } = params;
  const stripe = getStripeInstance();

  const payerEmail = await extractPayerEmailFromInvoice(stripe, invoice);
  if (payerEmail) return payerEmail;

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

  let subscription: Stripe.Subscription | null = null;
  const rawSub = (invoice as InvoiceWithSubscription).subscription;
  const subIdFromInvoice =
    typeof rawSub === "string"
      ? rawSub
      : rawSub && typeof rawSub === "object"
        ? (rawSub as Stripe.Subscription & { deleted?: boolean }).deleted
          ? null
          : (rawSub as Stripe.Subscription).id
        : null;
  const subIdToLoad = (knownSubscriptionId?.trim() || subIdFromInvoice || "").trim() || null;

  if (subIdToLoad) {
    try {
      subscription = await stripe.subscriptions.retrieve(subIdToLoad);
    } catch {
      subscription = null;
    }
  }

  const metaUid =
    typeof subscription?.metadata?.userId === "string" ? subscription.metadata.userId.trim() : "";

  const uidOrder =
    source === "checkout"
      ? [metaUid, callerUid]
      : [callerUid, metaUid];
  const uidsToTry = [...new Set(uidOrder.filter(Boolean))];

  for (const uid of uidsToTry) {
    const user = await getAdminAuth().getUser(uid).catch(() => null);
    const email = user?.email?.trim();
    if (email) return email;
  }

  const subId = subscription?.id ?? subIdToLoad;
  if (subId) {
    const ownerUid = await findConsumerProfileUidByStripeSubscriptionId(subId);
    if (ownerUid) {
      const user = await getAdminAuth().getUser(ownerUid).catch(() => null);
      const email = user?.email?.trim();
      if (email) return email;
    }
  }

  return null;
}

async function findConsumerProfileUidByStripeSubscriptionId(
  subscriptionId: string
): Promise<string | null> {
  const db = getAdminFirestore();
  const byString = await db
    .collection("profiles")
    .where("stripe_subscription_id", "==", subscriptionId)
    .limit(1)
    .get();
  if (!byString.empty) return byString.docs[0].id;

  /** Legacy shape: stripe_subscription_id: { id: "sub_..." } */
  const byNested = await db
    .collection("profiles")
    .where("stripe_subscription_id.id", "==", subscriptionId)
    .limit(1)
    .get();
  if (!byNested.empty) return byNested.docs[0].id;

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
  /** When set, used to load subscription metadata if the invoice omits `subscription` */
  subscriptionId?: string | null;
}): Promise<void> {
  const stripe = getStripeInstance();
  let receiptInvoice: Stripe.Invoice;
  try {
    receiptInvoice = await stripe.invoices.retrieve(options.invoiceId, {
      expand: ["lines.data", "customer", "subscription", "payment_intent.latest_charge"],
    });
  } catch {
    receiptInvoice = await stripe.invoices.retrieve(options.invoiceId, {
      expand: ["lines.data", "customer", "subscription"],
    });
  }
  const toEmail = await resolveSubscriptionReceiptRecipientEmail({
    invoice: receiptInvoice,
    callerUid: options.uid,
    source: options.source,
    knownSubscriptionId: options.subscriptionId ?? null,
  });
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

  try {
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
  } catch (err) {
    console.error(
      "[subscription receipt] EmailJS send failed for invoice",
      options.invoiceId,
      "to",
      toEmail,
      err
    );
  }
}
