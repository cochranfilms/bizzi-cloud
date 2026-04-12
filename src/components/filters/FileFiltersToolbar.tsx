"use client";

import { Search, Filter, SlidersHorizontal } from "lucide-react";
import { useState, useEffect } from "react";
import QuickFilterChips from "./QuickFilterChips";
import SortDropdown from "./SortDropdown";
import { QUICK_FILTERS } from "@/lib/filters/filter-presets";
import type { FilterState } from "@/lib/filters/apply-filters";

/** Filter toggle + search for TopBar (All files) — layout / view mode lives in Layout dropdown */
export function FileFiltersTopBarChrome({
  searchValue,
  onSearchChange,
  quickFiltersOpen,
  onToggleQuickFilters,
  hasActiveFilters = false,
  className = "",
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  quickFiltersOpen: boolean;
  onToggleQuickFilters: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  useEffect(() => {
    const t = setTimeout(() => onSearchChange(localSearch), 400);
    return () => clearTimeout(t);
  }, [localSearch, onSearchChange]);

  return (
    <div
      className={`flex min-w-0 w-full max-w-full items-center justify-start gap-2 sm:w-auto sm:max-w-none ${className}`}
    >
      <button
        type="button"
        onClick={onToggleQuickFilters}
        aria-expanded={quickFiltersOpen}
        className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-all ${
          hasActiveFilters
            ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:border-bizzi-cyan dark:bg-bizzi-cyan/10 dark:text-bizzi-cyan"
            : quickFiltersOpen
              ? "border-neutral-400 bg-neutral-50 text-neutral-900 dark:border-neutral-500 dark:bg-neutral-800 dark:text-white"
              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-700"
        }`}
      >
        <Filter className="h-4 w-4" />
        <span className="hidden sm:inline">Filters</span>
      </button>
      <div className="relative min-w-0 flex-1 sm:max-w-[14rem] md:max-w-[18rem]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search files, tags, projects…"
          className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-neutral-400 shadow-sm outline-none transition-all focus:border-bizzi-blue focus:ring-2 focus:ring-bizzi-blue/20 dark:border-neutral-600 dark:bg-neutral-800 dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20"
          aria-label="Search files"
        />
      </div>
    </div>
  );
}

/** Quick chips + sort + advanced — shown below TopBar when Filters is open */
export function FileFiltersExpandedStrip({
  filterState,
  setFilter,
  sortValue,
  onSortChange,
  onAdvancedClick,
  className = "",
}: {
  filterState: FilterState;
  setFilter: (id: string, value: string | string[] | boolean | undefined) => void;
  sortValue: string;
  onSortChange: (value: string) => void;
  onAdvancedClick: () => void;
  className?: string;
}) {
  const handleQuickApply = (changes: Record<string, string | string[] | boolean | undefined>) => {
    Object.entries(changes).forEach(([k, v]) => setFilter(k, v));
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <QuickFilterChips
        filters={QUICK_FILTERS}
        filterState={filterState}
        onApply={handleQuickApply}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <SortDropdown
          value={sortValue}
          onChange={(v) => {
            setFilter("sort", v);
            onSortChange(v);
          }}
          className="shrink-0"
        />
        <button
          type="button"
          onClick={onAdvancedClick}
          className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          <SlidersHorizontal className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          Advanced filters
        </button>
      </div>
    </div>
  );
}
