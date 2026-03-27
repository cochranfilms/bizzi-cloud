"use client";

import { X } from "lucide-react";
import type { ActiveFilter } from "@/lib/filters/apply-filters";

interface ActiveFilterBarProps {
  activeFilters: ActiveFilter[];
  /** Items currently shown in the grid for this view (e.g. after client-side merge). */
  loadedCount: number;
  /**
   * When true, the filter API reported another page for this query.
   * Not a global "total in library" — only "more pages exist for current filters".
   */
  hasMoreFromApi?: boolean;
  onLoadMore?: () => void;
  loadMoreLoading?: boolean;
  onRemove: (id: string, value?: string) => void;
  onClearAll: () => void;
  onSaveView?: () => void;
  isLoading?: boolean;
}

export default function ActiveFilterBar({
  activeFilters,
  loadedCount,
  hasMoreFromApi = false,
  onLoadMore,
  loadMoreLoading = false,
  onRemove,
  onClearAll,
  onSaveView,
  isLoading = false,
}: ActiveFilterBarProps) {
  if (activeFilters.length === 0 && !isLoading) return null;

  const countLabel = `${loadedCount} ${loadedCount === 1 ? "item" : "items"}`;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {activeFilters.map((af) => (
          <button
            key={`${af.id}-${String(af.value)}`}
            type="button"
            onClick={() => onRemove(af.id, typeof af.value === "string" ? af.value : undefined)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:border-neutral-300 hover:bg-neutral-50 hover:shadow dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-700"
          >
            <span>{af.label}</span>
            <X className="h-3.5 w-3.5 text-neutral-400" />
          </button>
        ))}
      </div>
      {activeFilters.length > 0 && (
        <>
          <button
            type="button"
            onClick={onClearAll}
            className="text-sm font-medium text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-300"
          >
            Clear all
          </button>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">•</span>
        </>
      )}
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        {isLoading ? "Loading…" : `Showing ${countLabel}`}
        {!isLoading && hasMoreFromApi ? " · More on server" : null}
      </span>
      {!isLoading && hasMoreFromApi && onLoadMore ? (
        <button
          type="button"
          onClick={() => void onLoadMore()}
          disabled={loadMoreLoading}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-bizzi-blue shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800 dark:text-bizzi-cyan dark:hover:bg-neutral-700"
        >
          {loadMoreLoading ? "Loading…" : "Load more"}
        </button>
      ) : null}
      {onSaveView && activeFilters.length > 0 && (
        <button
          type="button"
          onClick={onSaveView}
          className="ml-auto text-sm font-medium text-bizzi-blue hover:text-bizzi-blue/80 dark:text-bizzi-cyan dark:hover:text-bizzi-cyan/80"
        >
          Save view
        </button>
      )}
    </div>
  );
}
