"use client";

import { DATE_PRESETS } from "@/lib/filters/filter-presets";

interface DatePresetSelectorProps {
  value: string | undefined;
  customFrom: string | undefined;
  customTo: string | undefined;
  onPresetChange: (preset: string | undefined) => void;
  onCustomChange: (from: string | undefined, to: string | undefined) => void;
}

export default function DatePresetSelector({
  value,
  customFrom,
  customTo,
  onPresetChange,
  onCustomChange,
}: DatePresetSelectorProps) {
  const isCustom = value === "custom" || (!!customFrom && !value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {DATE_PRESETS.filter((p) => p.value !== "custom").map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onPresetChange(preset.value)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
              value === preset.value
                ? "bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-cyan/15 dark:text-bizzi-cyan"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPresetChange("custom")}
          className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
            isCustom
              ? "bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-cyan/15 dark:text-bizzi-cyan"
              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
          }`}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={customFrom ?? ""}
            onChange={(e) => onCustomChange(e.target.value || undefined, customTo)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          />
          <input
            type="date"
            value={customTo ?? ""}
            onChange={(e) => onCustomChange(customFrom, e.target.value || undefined)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          />
        </div>
      )}
    </div>
  );
}
