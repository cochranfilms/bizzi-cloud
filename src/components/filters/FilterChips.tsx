"use client";

import { X } from "lucide-react";
import type { ActiveFilter } from "@/lib/filters/apply-filters";

interface FilterChipsProps {
  activeFilters: ActiveFilter[];
  onRemove: (id: string, value?: string) => void;
  onClearAll: () => void;
}

export default function FilterChips({
  activeFilters,
  onRemove,
  onClearAll,
}: FilterChipsProps) {
  if (activeFilters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeFilters.map((af) => (
        <button
          key={`${af.id}-${String(af.value)}`}
          type="button"
          onClick={() => onRemove(af.id, typeof af.value === "string" ? af.value : undefined)}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
        >
          <span>{af.label}</span>
          <X className="h-3.5 w-3.5 text-neutral-400" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-sm font-medium text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-300"
      >
        Clear all
      </button>
    </div>
  );
}
