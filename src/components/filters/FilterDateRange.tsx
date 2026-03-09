"use client";

interface FilterDateRangeProps {
  from: string | undefined;
  to: string | undefined;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  label?: string;
}

export default function FilterDateRange({
  from,
  to,
  onFromChange,
  onToChange,
  label,
}: FilterDateRangeProps) {
  return (
    <div className="space-y-2">
      {label && (
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      )}
      <div className="flex gap-2">
        <input
          type="date"
          value={from ?? ""}
          onChange={(e) => onFromChange(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          type="date"
          value={to ?? ""}
          onChange={(e) => onToChange(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
    </div>
  );
}
