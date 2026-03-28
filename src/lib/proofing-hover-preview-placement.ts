/** Padding from viewport edges when clamping the proofing hover preview. */
export const PROOFING_HOVER_VIEWPORT_MARGIN = 10;

const DESKTOP_TARGET = 256;
const MIN_SIZE = 160;

/**
 * Square preview dimensions for the proofing hover popup, capped so
 * clamping in {@link getHoverPreviewPlacement} always has room.
 */
export function getProofingHoverPreviewSize(
  viewportWidth: number,
  viewportHeight: number
): { width: number; height: number } {
  const m = PROOFING_HOVER_VIEWPORT_MARGIN;
  const maxByViewport = Math.max(1, Math.min(viewportWidth, viewportHeight) - 2 * m);
  const capW = Math.floor(viewportWidth * 0.42);
  const capH = Math.floor(viewportHeight * 0.38);
  let side = Math.min(DESKTOP_TARGET, capW, capH, maxByViewport);
  side = Math.floor(side);
  if (maxByViewport >= MIN_SIZE) {
    side = Math.max(MIN_SIZE, Math.min(side, maxByViewport));
  } else {
    side = maxByViewport;
  }
  return { width: side, height: side };
}

export type HoverPreviewPlacementAnchor = Pick<DOMRectReadOnly, "top" | "right" | "left">;

/**
 * Prefer placing the popup to the right of the anchor; flip to the left if
 * there is not enough space; clamp so the box stays fully inside the viewport.
 * Top-aligns to the anchor by default, then clamps vertically.
 */
export function getHoverPreviewPlacement(
  anchorRect: HoverPreviewPlacementAnchor,
  popupWidth: number,
  popupHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  gap: number
): { left: number; top: number } {
  const m = PROOFING_HOVER_VIEWPORT_MARGIN;

  let left = anchorRect.right + gap;
  if (left + popupWidth > viewportWidth - m) {
    left = anchorRect.left - popupWidth - gap;
  }
  left = Math.max(m, Math.min(left, viewportWidth - popupWidth - m));

  let top = anchorRect.top;
  top = Math.max(m, Math.min(top, viewportHeight - popupHeight - m));

  return { left, top };
}

/**
 * Scale intrinsic image size to fit inside a max width/height box (preserve aspect).
 */
export function fitProofingPreviewToMaxBounds(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  if (!(naturalW > 0) || !(naturalH > 0)) {
    return { width: maxW, height: maxH };
  }
  const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
  return {
    width: Math.max(1, Math.round(naturalW * scale)),
    height: Math.max(1, Math.round(naturalH * scale)),
  };
}

/**
 * Vertical clamp range for `position:fixed` popups so they stay within the
 * visible viewport (handles mobile browser chrome via Visual Viewport API).
 */
export function getProofingHoverVerticalClampRange(
  popupHeight: number,
  margin: number = PROOFING_HOVER_VIEWPORT_MARGIN
): { minY: number; maxY: number } {
  if (typeof window === "undefined") {
    return { minY: margin, maxY: 800 - popupHeight - margin };
  }
  const vv = window.visualViewport;
  const ih = window.innerHeight;
  if (vv) {
    const minY = Math.max(margin, vv.offsetTop + margin);
    const maxY = Math.min(
      ih - popupHeight - margin,
      vv.offsetTop + vv.height - popupHeight - margin
    );
    return { minY, maxY };
  }
  return { minY: margin, maxY: ih - popupHeight - margin };
}

export type ProofingHoverCellRect = Pick<DOMRectReadOnly, "left" | "right">;

/**
 * Proofing table: prefer the popup in the asset column’s right gutter (clear of
 * filename), then clamp to the viewport; flip to the left of the thumbnail if
 * there is no horizontal room. Returns thumbnail-aligned `top`; clamp Y with
 * {@link getProofingHoverVerticalClampRange}.
 */
export function getProofingTableHoverPreviewPlacement(
  thumbRect: HoverPreviewPlacementAnchor,
  cellRect: ProofingHoverCellRect,
  popupWidth: number,
  popupHeight: number,
  viewportWidth: number,
  gap: number,
  cellRightInset: number
): { left: number; top: number } {
  const m = PROOFING_HOVER_VIEWPORT_MARGIN;
  const w = popupWidth;
  const vw = viewportWidth;

  const gutterLeft = cellRect.right - w - cellRightInset;
  const minLeftPastThumb = thumbRect.right + gap;
  let left = Math.max(gutterLeft, minLeftPastThumb);

  const wouldOverflowRight = left + w > vw - m;
  if (wouldOverflowRight) {
    const flipped = thumbRect.left - w - gap;
    if (flipped >= m) {
      left = flipped;
    } else {
      left = Math.max(m, vw - w - m);
    }
  }

  left = Math.max(m, Math.min(left, vw - w - m));

  /** Caller clamps vertically (e.g. {@link getProofingHoverVerticalClampRange}). */
  const top = thumbRect.top;

  return { left, top };
}
