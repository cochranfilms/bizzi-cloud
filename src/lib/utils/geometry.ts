/**
 * Check if two rectangles intersect (used for drag-to-select).
 * @param a - Rect as { left, top, right, bottom }
 * @param b - DOMRect from getBoundingClientRect()
 */
export function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect
): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}
