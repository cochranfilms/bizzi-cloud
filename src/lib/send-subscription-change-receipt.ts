/**
 * Shared itemized subscription receipt (EmailJS) for Stripe invoices.
 * Used after in-app subscription updates and after Checkout (invoice.paid).
 */
import { getAdminAuth } from "@/lib/firebase-admin";
import { sendSubscriptionChangeReceiptEmail } from "@/lib/emailjs";
import { getStripeInstance } from "@/lib/stripe";
import {
  buildSubscriptionLineItemsHtml,
  formatUsdFromCents,
  lineItemsFromStripeInvoice,
} from "@/lib/stripe-subscription-line-items";

export type SubscriptionReceiptSource = "subscription_update" | "checkout";

function manageBillingSettingsUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? (typeof process.env.VERCEL_URL === "string" ? `https://${process.env.VERCEL_URL}` : "https://www.bizzicloud.io")}/dashboard/settings`;
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
    expand: ["lines.data"],
  });
  const authUser = await getAdminAuth().getUser(options.uid).catch(() => null);
  const toEmail = authUser?.email;
  if (!toEmail?.trim()) {
    console.warn("[subscription receipt] skipped: no email for uid", options.uid);
    return;
  }

  const lineRows = lineItemsFromStripeInvoice(receiptInvoice);
  const lineItemsHtml = buildSubscriptionLineItemsHtml(lineRows);
  const amountPaid = receiptInvoice.amount_paid ?? 0;
  const amountDueOpen = receiptInvoice.amount_due ?? 0;
  const displayTotalCents =
    amountPaid > 0
      ? amountPaid
      : amountDueOpen !== 0
        ? Math.abs(amountDueOpen)
        : receiptInvoice.total ?? 0;

  let prorationNote: string;
  if (lineRows.some((r) => r.isProration)) {
    prorationNote =
      "Amounts include proration for the remainder of your current billing period.";
  } else if (options.source === "checkout") {
    prorationNote = "This receipt reflects your initial subscription purchase (secure checkout).";
  } else {
    prorationNote = "Subscription totals reflect your selected plan and add-ons.";
  }

  await sendSubscriptionChangeReceiptEmail({
    to_email: toEmail,
    change_summary: options.changeSummary,
    line_items_html: lineItemsHtml,
    total_amount: formatUsdFromCents(displayTotalCents),
    amount_status_line:
      amountPaid > 0
        ? `${formatUsdFromCents(amountPaid)} charged to your card on file.`
        : amountDueOpen < 0
          ? `A credit of ${formatUsdFromCents(Math.abs(amountDueOpen))} was applied to your account.`
          : "No additional amount was due for this change.",
    proration_note: prorationNote,
    invoice_id: receiptInvoice.number ?? receiptInvoice.id,
    manage_billing_url: manageBillingSettingsUrl(),
  });
}
