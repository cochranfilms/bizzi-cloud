"use client";

interface AuditFiltersProps {
  actionFilter: string;
  onActionFilterChange: (v: string) => void;
  onClear: () => void;
}

const ACTIONS = [
  "",
  "admin.login",
  "account.suspend",
  "account.restore",
  "billing.status_change",
  "file.override",
];

export default function AuditFilters({
  actionFilter,
  onActionFilterChange,
  onClear,
}: AuditFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={actionFilter}
        onChange={(e) => onActionFilterChange(e.target.value)}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a || "All actions"}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onClear}
        className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
      >
        Clear
      </button>
    </div>
  );
}
