"use client";

import type { FilterOption } from "@/lib/filters/filter-config";

interface FileTypeChipsProps {
  options: FilterOption[];
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}

export default function FileTypeChips({ options, value, onChange }: FileTypeChipsProps) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggle = (v: string) => {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    onChange(next.length === 1 ? next[0] : next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
            selected.includes(opt.value)
              ? "bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-cyan/15 dark:text-bizzi-cyan"
              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
