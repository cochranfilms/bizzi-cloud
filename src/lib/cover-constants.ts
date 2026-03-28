/**
 * Cover / hero image constants for responsive gallery display.
 * Design target: 2500×1400 px ideal upload, aspect preserved.
 * Derivatives: width-based for responsive srcset.
 */
export const COVER_DERIVATIVE_WIDTHS = {
  "cover-xs": 640,
  "cover-sm": 960,
  "cover-md": 1440,
  "cover-lg": 1920,
  "cover-xl": 2500,
} as const;

export type CoverSize = keyof typeof COVER_DERIVATIVE_WIDTHS;

export const COVER_RECOMMENDED_WIDTH = 2500;
export const COVER_RECOMMENDED_HEIGHT = 1400;
export const COVER_MAX_FILE_MB = 5;

/** Hero height presets (min-height). `fullscreen` matches legacy full-viewport hero. */
export const HERO_HEIGHT_PRESETS = {
  small: { desktop: "45vh", mobile: "50vh" },
  medium: { desktop: "55vh", mobile: "60vh" },
  large: { desktop: "65vh", mobile: "70vh" },
  cinematic: { desktop: "75vh", mobile: "80vh" },
  fullscreen: { desktop: "100dvh", mobile: "100dvh" },
} as const;

export type HeroHeightPreset = keyof typeof HERO_HEIGHT_PRESETS;
