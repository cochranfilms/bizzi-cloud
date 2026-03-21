/**
 * Filter presets for quick filters, date, size, and sort.
 * Used by the file browser filter UI.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom range" },
] as const;

export type DatePresetValue = (typeof DATE_PRESETS)[number]["value"];

export function datePresetToRange(
  preset: string
): { date_from: string; date_to: string } | null {
  const now = new Date();
  const toDate = new Date(now);
  toDate.setHours(23, 59, 59, 999);
  let fromDate: Date;

  switch (preset) {
    case "today":
      fromDate = new Date(now);
      fromDate.setHours(0, 0, 0, 0);
      break;
    case "last_7_days":
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
      break;
    case "last_30_days":
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
      break;
    case "this_week": {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      fromDate = new Date(now);
      fromDate.setDate(diff);
      fromDate.setHours(0, 0, 0, 0);
      break;
    }
    case "this_month":
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      return null;
  }
  return {
    date_from: fromDate.toISOString().slice(0, 10),
    date_to: toDate.toISOString().slice(0, 10),
  };
}

export const SIZE_PRESETS = [
  { value: "under_10mb", label: "Under 10 MB", minBytes: 0, maxBytes: 10 * MB },
  { value: "10_100mb", label: "10–100 MB", minBytes: 10 * MB, maxBytes: 100 * MB },
  { value: "100mb_1gb", label: "100 MB–1 GB", minBytes: 100 * MB, maxBytes: 1 * GB },
  { value: "1gb_plus", label: "1 GB+", minBytes: 1 * GB, maxBytes: undefined },
] as const;

export type SizePresetValue = (typeof SIZE_PRESETS)[number]["value"];

export function sizePresetToRange(
  preset: string
): { size_min?: number; size_max?: number } | null {
  const found = SIZE_PRESETS.find((p) => p.value === preset);
  if (!found) return null;
  return {
    size_min: found.minBytes,
    size_max: found.maxBytes,
  };
}

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "largest", label: "Largest first" },
  { value: "smallest", label: "Smallest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export interface QuickFilterDef {
  id: string;
  label: string;
  /** Filter state to apply when clicked (merge with current) */
  apply: Record<string, string | string[] | boolean>;
}

export const QUICK_FILTERS: QuickFilterDef[] = [
  { id: "videos", label: "Videos", apply: { media_type: "video" } },
  { id: "photos", label: "Photos", apply: { media_type: "photo" } },
  { id: "project_files", label: "Project Files", apply: { asset_type: "project_file" } },
  { id: "raw", label: "RAW", apply: { file_type: "raw" } },
  { id: "favorites", label: "Favorites", apply: { starred: true } },
  { id: "shared", label: "Shared", apply: { shared: true } },
  { id: "recent", label: "Recent", apply: { date_preset: "last_7_days" } },
  { id: "this_week", label: "This Week", apply: { date_preset: "this_week" } },
  { id: "large_files", label: "Large Files", apply: { size_preset: "100mb_1gb" } },
  { id: "delivered", label: "Delivered", apply: { usage_status: "delivered" } },
  { id: "in_review", label: "In Review", apply: { usage_status: "in_review" } },
];
