"use client";

const MB = 1024 * 1024;
import { SIZE_PRESETS } from "@/lib/filters/filter-presets";

interface FileSizeRangeProps {
  preset: string | undefined;
  minBytes: number | undefined;
  maxBytes: number | undefined;
  onPresetChange: (preset: string | undefined) => void;
  onRangeChange: (min: number | undefined, max: number | undefined) => void;
}

function formatMb(bytes: number | undefined): string {
  if (bytes == null || bytes < 0) return "";
  return String(Math.round(bytes / MB));
}

function parseMb(s: string): number | undefined {
  const n = parseInt(s, 10);
  if (isNaN(n) || n < 0) return undefined;
  return n * MB;
}

export default function FileSizeRange({
  preset,
  minBytes,
  maxBytes,
  onPresetChange,
  onRangeChange,
}: FileSizeRangeProps) {
  const minMb = formatMb(minBytes);
  const maxMb = formatMb(maxBytes);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPresetChange(p.value)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
              preset === p.value
                ? "bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-cyan/15 dark:text-bizzi-cyan"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <span>Or custom:</span>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            placeholder="Min MB"
            value={minMb}
            onChange={(e) => onRangeChange(parseMb(e.target.value), maxBytes)}
            className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          />
          <span>–</span>
          <input
            type="number"
            min={0}
            placeholder="Max MB"
            value={maxMb}
            onChange={(e) => onRangeChange(minBytes, parseMb(e.target.value))}
            className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800"
          />
          <span>MB</span>
        </div>
      </div>
    </div>
  );
}
