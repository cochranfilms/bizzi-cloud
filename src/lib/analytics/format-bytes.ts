/**
 * Human-readable byte formatting for storage analytics.
 * Handles very large numbers (TB, PB) without UI break.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 0 || !Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes < 1024 * 1024 * 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024 * 1024)).toFixed(1)} PB`;
}
