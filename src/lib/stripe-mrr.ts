/**
 * Compute MRR from a Stripe subscription's items.
 */

export function computeSubscriptionMrr(sub: { items: { data: unknown[] } }): number {
  let mrr = 0;
  for (const item of sub.items.data) {
    const it = item as { price?: { unit_amount?: number | null; recurring?: { interval?: string } | null }; deleted?: boolean };
    if (it.deleted) continue;
    const price = it.price;
    if (price?.unit_amount == null) continue;
    const amountCents = price.unit_amount;
    const interval = price.recurring?.interval;
    if (interval === "year") {
      mrr += amountCents / 100 / 12;
    } else {
      mrr += amountCents / 100;
    }
  }
  return mrr;
}
