/**
 * Normalized subscription invoice lines for UI previews and receipt emails.
 */
import type Stripe from "stripe";

export type SubscriptionPreviewLineItem = {
  description: string;
  amountCents: number;
  isProration: boolean;
};

/** Source of receipt copy (matches email footers). */
export type SubscriptionReceiptSource = "subscription_update" | "checkout";

/** In-app success dialog + email — same totals and lines as the receipt email. */
export type SubscriptionReceiptDisplay = {
  changeSummary: string;
  lineItems: Array<{
    description: string;
    amountCents: number;
    isProration: boolean;
  }>;
  totalAmount: string;
  amountStatusLine: string;
  prorationNote: string;
  invoiceId: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function invoiceLineIsProration(line: Stripe.InvoiceLineItem): boolean {
  const p = line.parent;
  if (!p) return false;
  return p.subscription_item_details?.proration === true || p.invoice_item_details?.proration === true;
}

export function lineItemsFromStripeInvoice(invoice: Stripe.Invoice): SubscriptionPreviewLineItem[] {
  return (invoice.lines?.data ?? []).map((line) => ({
    description: (line.description ?? "Line item").trim() || "Line item",
    amountCents: line.amount ?? 0,
    isProration: invoiceLineIsProration(line),
  }));
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** HTML table for EmailJS template variable `{{{line_items_html}}}` (triple brace = raw HTML). */
export function buildSubscriptionLineItemsHtml(items: SubscriptionPreviewLineItem[]): string {
  if (items.length === 0) {
    return "<p><em>No line items on this invoice.</em></p>";
  }
  const rows = items
    .map((row) => {
      const prefix = row.isProration ? "Proration · " : "";
      const amt = formatUsdFromCents(row.amountCents);
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(prefix + row.description)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;">${escapeHtml(amt)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr><th align="left" style="padding:8px 12px;border-bottom:2px solid #cbd5e1;">Description</th><th align="right" style="padding:8px 12px;border-bottom:2px solid #cbd5e1;">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Plain-text line items for `{{line_items_plain}}` — survives EmailJS HTML-escaping (no raw HTML needed).
 */
export function buildSubscriptionLineItemsPlain(items: SubscriptionPreviewLineItem[]): string {
  if (items.length === 0) return "No line items on this invoice.";
  const lines: string[] = [];
  for (const row of items) {
    const prefix = row.isProration ? "Proration · " : "";
    const amt = formatUsdFromCents(row.amountCents);
    lines.push(`${prefix}${row.description}`);
    lines.push(`  ${amt}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** Builds receipt fields shared by EmailJS and the post-update success modal. */
export function buildSubscriptionReceiptDisplay(
  invoice: Stripe.Invoice,
  changeSummary: string,
  source: SubscriptionReceiptSource
): SubscriptionReceiptDisplay {
  const lineRows = lineItemsFromStripeInvoice(invoice);
  const amountPaid = invoice.amount_paid ?? 0;
  const amountDueOpen = invoice.amount_due ?? 0;
  const displayTotalCents =
    amountPaid > 0
      ? amountPaid
      : amountDueOpen !== 0
        ? Math.abs(amountDueOpen)
        : invoice.total ?? 0;

  let prorationNote: string;
  if (lineRows.some((r) => r.isProration)) {
    prorationNote =
      "Amounts include proration for the remainder of your current billing period.";
  } else if (source === "checkout") {
    prorationNote = "This receipt reflects your initial subscription purchase (secure checkout).";
  } else {
    prorationNote = "Subscription totals reflect your selected plan and add-ons.";
  }

  const amountStatusLine =
    amountPaid > 0
      ? `${formatUsdFromCents(amountPaid)} charged to your card on file.`
      : amountDueOpen < 0
        ? `A credit of ${formatUsdFromCents(Math.abs(amountDueOpen))} was applied to your account.`
        : "No additional amount was due for this change.";

  return {
    changeSummary,
    lineItems: lineRows.map((r) => ({
      description: r.isProration ? `Proration · ${r.description}` : r.description,
      amountCents: r.amountCents,
      isProration: r.isProration,
    })),
    totalAmount: formatUsdFromCents(displayTotalCents),
    amountStatusLine,
    prorationNote,
    invoiceId: invoice.number ?? invoice.id,
  };
}
