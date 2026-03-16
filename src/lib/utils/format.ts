/**
 * Shared formatting utilities for consistent display across the app.
 */

export { formatBytes } from "@/lib/analytics/format-bytes";

/**
 * Format ISO date string to short locale date (e.g. "Mar 16, 2025").
 * Returns "—" for null/empty.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
