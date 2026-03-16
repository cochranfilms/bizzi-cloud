/**
 * Centralized loading copy for consistent UX.
 * Use these constants instead of hardcoded strings.
 * Ready for i18n migration (Phase 4).
 */
export const LOADING = {
  default: "Loading…",
  files: "Loading files…",
  shares: "Loading shares…",
  favorites: "Loading favorites…",
  galleries: "Loading your galleries…",
  transfer: "Loading transfer…",
  filesYour: "Loading your files…",
  preview: "Loading preview…",
  comments: "Loading comments…",
  transferPreview: "Loading preview…",
} as const;

/** Alias for LOADING - use in components. */
export const LOADING_COPY = LOADING;

export type LoadingKey = keyof typeof LOADING;
