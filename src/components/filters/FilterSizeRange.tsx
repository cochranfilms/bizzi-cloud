"use client";

const MB = 1024 * 1024;

function formatMb(bytes: number | undefined): string {
  if (bytes == null || bytes < 0) return "";
  return String(Math.round(bytes / MB));
}

function parseMbToBytes(val: string): number | undefined {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 0) return undefined;
  return n * MB;
}

interface FilterSizeRangeProps {
  minBytes?: number;
  maxBytes?: number;
  onMinChange: (bytes: number | undefined) => void;
  onMaxChange: (bytes: number | undefined) => void;
  label?: string;
  /** Max value in bytes for the range (default 50 GB) */
  configMax?: number;
}

export default function FilterSizeRange({
  minBytes,
  maxBytes,
  onMinChange,
  onMaxChange,
  label,
  configMax = 50 * 1024 * 1024 * 1024,
}: FilterSizeRangeProps) {
  const maxMb = Math.round(configMax / MB);
  const minVal = formatMb(minBytes);
  const maxVal = formatMb(maxBytes);

  return (
    <div className="space-y-2">
      {label && (
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      )}
      <div className="grid grid-cols-2 gap-2 min-w-0">
        <div className="relative">
          <input
            type="number"
            min={0}
            max={maxMb}
            step={1}
            placeholder="Min MB"
            value={minVal}
            onChange={(e) => onMinChange(parseMbToBytes(e.target.value))}
            className="min-w-0 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 pr-8 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
            MB
          </span>
        </div>
        <div className="relative">
          <input
            type="number"
            min={0}
            max={maxMb}
            step={1}
            placeholder="Max MB"
            value={maxVal}
            onChange={(e) => onMaxChange(parseMbToBytes(e.target.value))}
            className="min-w-0 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 pr-8 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
            MB
          </span>
        </div>
      </div>
    </div>
  );
}
