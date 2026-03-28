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

export type ProofingHoverCellRect = Pick<DOMRectReadOnly, "left" | "right">;

/**
 * Proofing table: prefer the popup in the asset column’s right gutter (clear of
 * filename), then clamp to the viewport; flip to the left of the thumbnail if
 * there is no horizontal room. Vertical position follows the thumbnail top.
 */
export function getProofingTableHoverPreviewPlacement(
  thumbRect: HoverPreviewPlacementAnchor,
  cellRect: ProofingHoverCellRect,
  popupWidth: number,
  popupHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  gap: number,
  cellRightInset: number
): { left: number; top: number } {
  const m = PROOFING_HOVER_VIEWPORT_MARGIN;
  const w = popupWidth;
  const vw = viewportWidth;
  const vh = viewportHeight;

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

  let top = thumbRect.top;
  top = Math.max(m, Math.min(top, vh - popupHeight - m));

  return { left, top };
}
