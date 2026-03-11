"use client";

import { useEffect, useRef } from "react";

const DRAG_THRESHOLD_PX = 5;
const SCROLL_ZONE_HEIGHT = 80;
const SCROLL_SPEED = 12;

interface DragState {
  isActive: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Auto-scrolls the page when dragging to select files near the top/bottom edges.
 * Call this hook and update mousePosRef in your mousemove handler.
 */
export function useDragToSelectAutoScroll(
  gridSectionRef: React.RefObject<HTMLElement | null>,
  dragState: DragState | null,
  mousePosRef: React.MutableRefObject<{ x: number; y: number } | null>
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!dragState?.isActive) return;
    const moved =
      Math.abs(dragState.currentX - dragState.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(dragState.currentY - dragState.startY) > DRAG_THRESHOLD_PX;
    if (!moved) return;

    const scrollContainer =
      (gridSectionRef.current?.closest("main") as HTMLElement | null) ??
      document.scrollingElement;
    if (!scrollContainer) return;

    intervalRef.current = setInterval(() => {
      const pos = mousePosRef.current;
      if (!pos) return;

      const viewportHeight = window.innerHeight;
      const inTopZone = pos.y < SCROLL_ZONE_HEIGHT;
      const inBottomZone = pos.y > viewportHeight - SCROLL_ZONE_HEIGHT;

      let delta = 0;
      if (inTopZone) {
        const intensity = 1 - pos.y / SCROLL_ZONE_HEIGHT;
        delta = -SCROLL_SPEED * intensity;
      } else if (inBottomZone) {
        const distFromBottom = viewportHeight - pos.y;
        const intensity = distFromBottom / SCROLL_ZONE_HEIGHT;
        delta = SCROLL_SPEED * intensity;
      }

      if (delta !== 0) {
        scrollContainer.scrollTop += delta;
      }
    }, 16);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [dragState?.isActive, dragState?.currentX, dragState?.currentY, dragState?.startX, dragState?.startY, gridSectionRef]);
}
