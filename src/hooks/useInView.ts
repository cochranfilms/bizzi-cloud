"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns true when the element is in view. Uses IntersectionObserver.
 * Useful for lazy-loading video thumbnails only when cards are visible.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(): [
  ref: React.RefObject<T | null>,
  isInView: boolean
] {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsInView(true);
      },
      { rootMargin: "50px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, isInView];
}
