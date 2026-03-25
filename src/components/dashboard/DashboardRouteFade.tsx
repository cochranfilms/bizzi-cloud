"use client";

import { useEffect, useState } from "react";

export type DashboardRouteFadeProps = {
  ready: boolean;
  children: React.ReactNode;
  /** Screen-reader label while waiting (no visible loading copy). */
  srOnlyMessage?: string;
  /** Shorter placeholder for toolbars / cards (default is full-page style). */
  compact?: boolean;
  /** Extra classes merged onto the placeholder (overrides compact size when needed). */
  placeholderClassName?: string;
};

/**
 * Standard dashboard reveal: short gradient placeholder, then an ~850ms opacity fade-in.
 * Use `ready` when data required to paint the route is loaded.
 */
export default function DashboardRouteFade({
  ready,
  children,
  srOnlyMessage = "Loading page content",
  compact = false,
  placeholderClassName = "",
}: DashboardRouteFadeProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!ready) {
      setEntered(false);
      return;
    }
    let cancelled = false;
    const id1 = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (!cancelled) setEntered(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
    };
  }, [ready]);

  const placeholderBase = compact
    ? "min-h-24 w-full rounded-xl bg-gradient-to-b from-neutral-200/40 to-transparent dark:from-neutral-800/50 dark:to-transparent"
    : "min-h-[min(42vh,26rem)] w-full rounded-2xl bg-gradient-to-b from-neutral-200/40 to-transparent dark:from-neutral-800/50 dark:to-transparent";

  return (
    <>
      {!ready && (
        <div
          className={`${placeholderBase} ${placeholderClassName}`.trim()}
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">{srOnlyMessage}</span>
        </div>
      )}
      {ready && (
        <div
          className={`transition-opacity duration-[850ms] ease-out motion-reduce:transition-none ${
            entered ? "opacity-100" : "opacity-0"
          }`}
        >
          {children}
        </div>
      )}
    </>
  );
}
