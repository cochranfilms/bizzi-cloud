/**
 * Enterprise organization pricing for admin create-org flow.
 * Used when creating Stripe invoices for storage and seats.
 */

/** Price per seat per month (matches SEAT_PRICE from pricing-data) */
export const ENTERPRISE_SEAT_PRICE = 9;

/** Enterprise storage tier: bytes and monthly price in dollars */
export interface EnterpriseStorageTier {
  id: string;
  label: string;
  bytes: number;
  priceMonthly: number;
}

const TB = 1024 * 1024 * 1024 * 1024;

/** Enterprise storage tiers for admin create-org form */
export const ENTERPRISE_STORAGE_TIERS: EnterpriseStorageTier[] = [
  { id: "1tb", label: "1 TB", bytes: 1 * TB, priceMonthly: 50 },
  { id: "5tb", label: "5 TB", bytes: 5 * TB, priceMonthly: 200 },
  { id: "16tb", label: "16 TB", bytes: 16 * TB, priceMonthly: 500 },
];

/** Get storage tier by bytes, or null if not a standard tier */
export function getStorageTierByBytes(bytes: number): EnterpriseStorageTier | null {
  return ENTERPRISE_STORAGE_TIERS.find((t) => t.bytes === bytes) ?? null;
}

/** Get price for storage bytes. Uses tier pricing if exact match, else estimates by $/TB from 1TB tier */
export function getStoragePriceMonthly(bytes: number): number {
  const tier = getStorageTierByBytes(bytes);
  if (tier) return tier.priceMonthly;
  const tb = bytes / TB;
  return Math.round(tb * ENTERPRISE_STORAGE_TIERS[0].priceMonthly);
}
