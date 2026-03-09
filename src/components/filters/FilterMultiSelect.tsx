"use client";

import type { FilterOption } from "@/lib/filters/filter-config";

interface FilterMultiSelectProps {
  options: FilterOption[];
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  label?: string;
}

export default function FilterMultiSelect({
  options,
  value,
  onChange,
  label,
}: FilterMultiSelectProps) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next.length === 1 ? next[0] : next);
  };
  return (
    <div className="space-y-2">
      {label && (
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      )}
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4 rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue/20 dark:border-neutral-600"
            />
            <span className="text-neutral-700 dark:text-neutral-300">
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
