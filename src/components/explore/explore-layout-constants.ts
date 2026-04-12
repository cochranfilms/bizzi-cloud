/**
 * Single source of truth for Explore Bizzi anchor offset vs sticky marketing header.
 * Tune once here; keep scroll-margin, smooth scroll, and scroll-spy aligned.
 *
 * Target ~88px: typical glass header + safe area. Verify in devtools against
 * `Header` on `/explore` if nav height changes.
 */
export const EXPLORE_ANCHOR_OFFSET_PX = 88;

/** Tailwind arbitrary scroll margin — use on every major section wrapper. */
export const EXPLORE_SCROLL_MARGIN_CLASS = "scroll-mt-[5.5rem]";

/**
 * IntersectionObserver rootMargin (legacy path if IO used).
 * Negative top pulls the observation band below the header.
 */
export const exploreObserverRootMargin = `-${EXPLORE_ANCHOR_OFFSET_PX}px 0px -55% 0px`;

/** Hysteresis (px): require scroll delta before changing active id (reduces flicker). */
export const EXPLORE_SCROLL_SPY_HYSTERESIS_PX = 8;
