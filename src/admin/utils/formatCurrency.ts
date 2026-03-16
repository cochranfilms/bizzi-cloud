/**
 * Format currency for admin dashboard.
 * Use formatCurrencyWithLocale for explicit locale/currency, or useAdminFormatCurrency
 * in admin components to respect platform display settings.
 */
export function formatCurrency(
  value: number,
  currency = "USD",
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
