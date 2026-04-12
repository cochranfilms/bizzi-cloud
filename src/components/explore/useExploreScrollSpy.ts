"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXPLORE_ANCHOR_OFFSET_PX,
  EXPLORE_SCROLL_SPY_HYSTERESIS_PX,
} from "@/components/explore/explore-layout-constants";

/**
 * Stable active section id for long pages: pick the last section whose top is at or above
 * the activation line (viewport top + header offset). Avoids flicker from overlapping IO regions.
 */
export function useExploreScrollSpy(sectionIds: readonly string[]): string {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] ?? "");
  const lastIdRef = useRef<string>(sectionIds[0] ?? "");
  const ticking = useRef(false);

  const compute = useCallback(() => {
    const line = window.scrollY + EXPLORE_ANCHOR_OFFSET_PX + EXPLORE_SCROLL_SPY_HYSTERESIS_PX;
    let current = sectionIds[0] ?? "";
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (top <= line) current = id;
      else break;
    }
    if (current && current !== lastIdRef.current) {
      lastIdRef.current = current;
      setActiveId(current);
    }
  }, [sectionIds]);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        compute();
      });
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [compute]);

  return activeId;
}
