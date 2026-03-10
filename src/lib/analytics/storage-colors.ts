/**
 * Category color tokens for storage analytics.
 * Distinct, accessible colors for each Bizzi Cloud storage category.
 */

export const STORAGE_CATEGORY_COLORS: Record<string, string> = {
  videos: "bg-blue-500",
  photos: "bg-emerald-500",
  raw_photos: "bg-amber-500",
  audio: "bg-violet-500",
  documents: "bg-slate-500",
  projects: "bg-rose-500",
  luts_presets: "bg-teal-500",
  archived: "bg-neutral-500",
  shared: "bg-cyan-500",
  trash: "bg-red-500",
  system: "bg-zinc-500",
  other: "bg-gray-400",
};

/** Hex colors for charts (where Tailwind classes don't apply). */
export const STORAGE_CATEGORY_HEX: Record<string, string> = {
  videos: "#3b82f6",
  photos: "#10b981",
  raw_photos: "#f59e0b",
  audio: "#8b5cf6",
  documents: "#64748b",
  projects: "#f43f5e",
  luts_presets: "#14b8a6",
  archived: "#737373",
  shared: "#06b6d4",
  trash: "#ef4444",
  system: "#71717a",
  other: "#9ca3af",
};
