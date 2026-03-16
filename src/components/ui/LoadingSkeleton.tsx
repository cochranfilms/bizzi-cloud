"use client";

interface LoadingSkeletonProps {
  /** Variant: lines (default), grid, card */
  variant?: "lines" | "grid" | "card";
  /** For lines: number of lines. For grid: number of cards. */
  count?: number;
  /** Additional className for wrapper */
  className?: string;
}

/** Shared loading skeleton. Use variant="grid" for file/trash grids, "lines" for lists. */
export function LoadingSkeleton({
  variant = "lines",
  count = 3,
  className = "",
}: LoadingSkeletonProps) {
  if (variant === "lines") {
    return (
      <div className={`animate-pulse space-y-3 ${className}`} aria-busy="true">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded bg-neutral-200 dark:bg-neutral-700"
            style={{ width: i === count - 1 && count > 1 ? "75%" : "100%" }}
          />
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div
        className={`grid gap-4 animate-pulse sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${className}`}
        aria-busy="true"
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="mb-3 h-16 w-16 rounded-xl bg-neutral-200 dark:bg-neutral-700" />
            <div className="mb-1 h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-3 w-1/2 rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="mt-2 h-3 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        className={`animate-pulse rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900 ${className}`}
        aria-busy="true"
      >
        <div className="mb-4 h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="mb-2 h-6 w-full rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="mb-4 h-3 w-3/4 rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-3 w-1/2 rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
    );
  }

  return null;
}
