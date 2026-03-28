/**
 * Normalized subscription invoice lines for UI previews and receipt emails.
 */
import type Stripe from "stripe";

export type SubscriptionPreviewLineItem = {
  description: string;
  amountCents: number;
  isProration: boolean;
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

/** HTML table for EmailJS template variable `line_items_html`. */
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
