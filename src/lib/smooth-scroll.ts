/** Softer than browser default `smooth` — long ease for in-page navigation. */
function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function parseScrollMarginTopPx(el: HTMLElement): number {
  const raw = getComputedStyle(el).scrollMarginTop;
  if (!raw || raw === "auto") return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Scroll so `element`'s top aligns with the viewport top, honoring CSS `scroll-margin-top`
 * (e.g. sticky header). Uses a long eased animation when motion is allowed.
 */
export function smoothScrollToElement(
  element: HTMLElement,
  options?: { durationMs?: number }
): Promise<void> {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) {
    element.scrollIntoView({ behavior: "auto", block: "start" });
    return Promise.resolve();
  }

  const duration = options?.durationMs ?? 1250;
  const marginTop = parseScrollMarginTopPx(element);
  const absoluteTop =
    window.scrollY + element.getBoundingClientRect().top - marginTop;
  const targetY = Math.max(0, absoluteTop);
  const startY = window.scrollY;
  const delta = targetY - startY;

  if (Math.abs(delta) < 2) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const t0 = performance.now();

    function frame(now: number) {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / duration);
      const eased = easeInOutQuint(t);
      window.scrollTo({ top: startY + delta * eased, left: 0, behavior: "auto" });
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}
