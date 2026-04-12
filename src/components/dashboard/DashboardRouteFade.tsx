"use client";

import { useEffect, useState } from "react";

/**
 * Opacity reveal aligned with {@link DashboardRouteFade} (~850ms): double `requestAnimationFrame`, then full opacity.
 * Use with `transition-opacity duration-[850ms] ease-out motion-reduce:transition-none`.
 */
export function useDashboardItemReveal(enabled: boolean | undefined): boolean {
  const [entered, setEntered] = useState(!enabled);
  useEffect(() => {
    if (!enabled) {
      setEntered(true);
      return;
    }
    setEntered(false);
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
  }, [enabled]);
  return entered;
}

export type DashboardRouteFadeProps = {
  ready: boolean;
  children: React.ReactNode;
  /** Screen-reader label while waiting (no visible loading copy). */
  srOnlyMessage?: string;
  /** Shorter placeholder for toolbars / cards (default is full-page style). */
  compact?: boolean;
  /** Extra classes merged onto the placeholder (overrides compact size when needed). */
  placeholderClassName?: string;
  /**
   * Classes merged onto the ready-state inner wrapper (with opacity transition).
   * Use inside fixed-height shells so scroll works: e.g. `flex min-h-0 flex-1 flex-col`.
   */
  readyContentClassName?: string;
};

export type DashboardLoadingPlaceholderProps = Pick<
  DashboardRouteFadeProps,
  "srOnlyMessage" | "compact" | "placeholderClassName"
>;

export function DashboardLoadingPlaceholder({
  srOnlyMessage = "Loading page content",
  compact = false,
  placeholderClassName = "",
}: DashboardLoadingPlaceholderProps) {
  const placeholderBase = compact
    ? "min-h-24 w-full rounded-xl bg-gradient-to-b from-neutral-200/40 to-transparent dark:from-neutral-800/50 dark:to-transparent"
    : "min-h-[min(42vh,26rem)] w-full rounded-2xl bg-gradient-to-b from-neutral-200/40 to-transparent dark:from-neutral-800/50 dark:to-transparent";

  return (
    <div
      className={`${placeholderBase} ${placeholderClassName}`.trim()}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{srOnlyMessage}</span>
    </div>
  );
}

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
  readyContentClassName = "",
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

  return (
    <>
      {!ready && (
        <DashboardLoadingPlaceholder
          srOnlyMessage={srOnlyMessage}
          compact={compact}
          placeholderClassName={placeholderClassName}
        />
      )}
      {ready && (
        <div
          className={`transition-opacity duration-[850ms] ease-out motion-reduce:transition-none ${
            entered ? "opacity-100" : "opacity-0"
          } ${readyContentClassName}`.trim()}
        >
          {children}
        </div>
      )}
    </>
  );
}
