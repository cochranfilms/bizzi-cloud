/**
 * Single visual contract for gallery cover / hero: public page and settings preview
 * must use these helpers so behavior cannot drift.
 */
import { HERO_HEIGHT_PRESETS, type HeroHeightPreset } from "@/lib/cover-constants";
import { getCoverObjectPosition } from "@/lib/cover-position";
import type { CoverPosition } from "@/types/gallery";

const ALLOWED_PRESETS = new Set<HeroHeightPreset>([
  "small",
  "medium",
  "large",
  "cinematic",
  "fullscreen",
]);

/** Stored Firestore value: null/legacy → fullscreen (preserves historical full-viewport hero). */
export function resolveCoverHeroPreset(
  stored: string | null | undefined
): HeroHeightPreset {
  if (stored && ALLOWED_PRESETS.has(stored as HeroHeightPreset)) {
    return stored as HeroHeightPreset;
  }
  return "fullscreen";
}

export function isAllowedCoverHeroHeight(
  v: unknown
): v is HeroHeightPreset | null {
  if (v === null || v === undefined) return true;
  return typeof v === "string" && ALLOWED_PRESETS.has(v as HeroHeightPreset);
}

export type CoverOverlayMode = "solid" | "gradient";

export function clampCoverOverlayOpacity(opacity: unknown): number {
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) return 50;
  return Math.max(0, Math.min(100, opacity));
}

/** CSS background for the hero overlay layer (full-bleed absolute inset-0). */
export function getCoverOverlayBackground(
  opacity0to100: number,
  mode: CoverOverlayMode
): string {
  const o = clampCoverOverlayOpacity(opacity0to100) / 100;
  if (mode === "solid") {
    return `rgba(0,0,0,${o})`;
  }
  return `linear-gradient(to bottom, rgba(0,0,0,${o * 0.6}) 0%, transparent 30%, transparent 70%, rgba(0,0,0,${o * 0.9}) 100%)`;
}

/**
 * Map `50vh` → `50%` so preview frames can use a fixed-height “viewport” parent;
 * percentage min-height then matches vh semantics inside that frame.
 */
export function vhRuleToPreviewPercent(vhRule: string): string {
  const m = /^([\d.]+)\s*(?:vh|dvh|svh|lvh)$/i.exec(vhRule.trim());
  if (!m) return "55%";
  return `${m[1]}%`;
}

export function getPreviewHeroMinHeightPercent(
  preset: HeroHeightPreset,
  previewMode: "desktop" | "mobile"
): string {
  const row = HERO_HEIGHT_PRESETS[preset];
  const rule = previewMode === "mobile" ? row.mobile : row.desktop;
  return vhRuleToPreviewPercent(rule);
}

/** Inline styles for live hero: pairs with `.gallery-hero-dynamic-height` in globals.css */
export function getLiveHeroHeightCssVars(preset: HeroHeightPreset): {
  "--gallery-hero-min-mobile": string;
  "--gallery-hero-min-desktop": string;
} {
  const row = HERO_HEIGHT_PRESETS[preset];
  return {
    "--gallery-hero-min-mobile": row.mobile,
    "--gallery-hero-min-desktop": row.desktop,
  };
}

export type CoverTitleAlignment = "left" | "center" | "right";

export interface CoverHeroContentLayout {
  /** Inner stack: flex + gap + alignment + text align */
  stackClassName: string;
  titleClassName: string;
  welcomeClassName: string;
  instructionsClassName: string;
}

/** Horizontal + vertical padding on the hero section (live and preview). */
export function getCoverHeroSectionPaddingClass(): string {
  return "px-4 py-24 text-center sm:px-6";
}

export function getCoverHeroContentLayout(
  alignment: CoverTitleAlignment | null | undefined
): CoverHeroContentLayout {
  const baseStack =
    "relative z-10 flex w-full max-w-6xl flex-col gap-6 text-white";
  let stackClassName: string;
  switch (alignment) {
    case "left":
      stackClassName = `${baseStack} items-start text-left`;
      break;
    case "right":
      stackClassName = `${baseStack} items-end text-right`;
      break;
    default:
      stackClassName = `${baseStack} items-center text-center`;
  }
  return {
    stackClassName,
    titleClassName: "max-w-3xl text-4xl font-semibold sm:text-5xl",
    welcomeClassName: "max-w-xl text-lg text-white/90",
    instructionsClassName: "max-w-md text-sm text-white/75",
  };
}

/** Title font stack used on the live gallery hero */
export const COVER_HERO_TITLE_FONT_FAMILY =
  "Georgia, Cambria, 'Times New Roman', serif";

export function resolveCoverObjectPosition(opts: {
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  cover_position?: CoverPosition | string | null;
}): string {
  return getCoverObjectPosition(opts);
}
