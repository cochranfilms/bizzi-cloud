"use client";

import { Search, Filter, LayoutGrid, List, ImageIcon } from "lucide-react";
import { useState, useEffect } from "react";
import QuickFilterChips from "./QuickFilterChips";
import SortDropdown from "./SortDropdown";
import { QUICK_FILTERS } from "@/lib/filters/filter-presets";
import type { FilterState } from "@/lib/filters/apply-filters";

interface FileFiltersToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterState: FilterState;
  setFilter: (id: string, value: string | string[] | boolean | undefined) => void;
  sortValue: string;
  onSortChange: (value: string) => void;
  onFiltersClick: () => void;
  viewMode?: "grid" | "list" | "thumbnail";
  onViewModeChange?: (mode: "grid" | "list" | "thumbnail") => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export default function FileFiltersToolbar({
  searchValue,
  onSearchChange,
  filterState,
  setFilter,
  sortValue,
  onSortChange,
  onFiltersClick,
  viewMode = "grid",
  onViewModeChange,
  hasActiveFilters = false,
  className = "",
}: FileFiltersToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  useEffect(() => {
    const t = setTimeout(() => onSearchChange(localSearch), 400);
    return () => clearTimeout(t);
  }, [localSearch, onSearchChange]);

  const handleQuickApply = (changes: Record<string, string | string[] | boolean | undefined>) => {
    Object.entries(changes).forEach(([k, v]) => setFilter(k, v));
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search files, tags, projects…"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder-neutral-400 shadow-sm outline-none transition-all focus:border-bizzi-blue focus:ring-2 focus:ring-bizzi-blue/20 dark:border-neutral-600 dark:bg-neutral-800 dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20"
            aria-label="Search files"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuickFilterChips
            filters={QUICK_FILTERS}
            filterState={filterState}
            onApply={handleQuickApply}
          />
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
            onClick={onFiltersClick}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium shadow-sm transition-all ${
              hasActiveFilters
                ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:border-bizzi-cyan dark:bg-bizzi-cyan/10 dark:text-bizzi-cyan"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-700"
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          {onViewModeChange && (
            <div className="flex shrink-0 gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-600 dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => onViewModeChange("list")}
                className={`rounded-md p-2 transition-colors ${
                  viewMode === "list"
                    ? "bg-white text-bizzi-blue shadow dark:bg-neutral-700"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                }`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange("grid")}
                className={`rounded-md p-2 transition-colors ${
                  viewMode === "grid"
                    ? "bg-white text-bizzi-blue shadow dark:bg-neutral-700"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange("thumbnail")}
                className={`rounded-md p-2 transition-colors ${
                  viewMode === "thumbnail"
                    ? "bg-white text-bizzi-blue shadow dark:bg-neutral-700"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                }`}
                aria-label="Thumbnail view"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
