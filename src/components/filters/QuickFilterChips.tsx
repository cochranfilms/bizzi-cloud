"use client";

import { useRef, useEffect } from "react";
import type { QuickFilterDef } from "@/lib/filters/filter-presets";
import type { FilterState } from "@/lib/filters/apply-filters";

interface QuickFilterChipsProps {
  filters: QuickFilterDef[];
  filterState: FilterState;
  /** Apply filters (or pass undefined to clear a key) */
  onApply: (apply: Record<string, string | string[] | boolean | undefined>) => void;
  className?: string;
}

function isQuickFilterActive(
  filterState: FilterState,
  apply: Record<string, string | string[] | boolean>
): boolean {
  return Object.entries(apply).every(([key, value]) => {
    const current = filterState[key];
    if (typeof value === "boolean") return current === value;
    if (Array.isArray(value)) {
      const arr = Array.isArray(current) ? current : current ? [current] : [];
      return value.every((v) => arr.includes(v));
    }
    return current === value;
  });
}

export default function QuickFilterChips({
  filters,
  filterState,
  onApply,
  className = "",
}: QuickFilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleClick = (def: QuickFilterDef) => {
    const isActive = isQuickFilterActive(filterState, def.apply);
    if (isActive) {
      const clear = Object.fromEntries(
        Object.keys(def.apply).map((k) => [k, undefined as string | string[] | boolean | undefined])
      );
      onApply(clear);
    } else {
      onApply(def.apply);
    }
  };

  return (
    <div
      ref={scrollRef}
      className={`flex gap-2 overflow-x-auto pb-1 -mx-1 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-700 ${className}`}
      style={{ scrollbarWidth: "thin" }}
    >
      {filters.map((def) => {
        const active = isQuickFilterActive(filterState, def.apply);
        return (
          <button
            key={def.id}
            type="button"
            onClick={() => handleClick(def)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active
                ? "bg-bizzi-blue/15 text-bizzi-blue border border-bizzi-blue/30 shadow-sm dark:bg-bizzi-cyan/15 dark:text-bizzi-cyan dark:border-bizzi-cyan/30"
                : "bg-neutral-100 text-neutral-700 border border-transparent hover:bg-neutral-200 hover:border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:border-neutral-600"
            }`}
          >
            {def.label}
          </button>
        );
      })}
    </div>
  );
}
