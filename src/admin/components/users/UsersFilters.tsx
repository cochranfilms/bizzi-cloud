"use client";

import { Search } from "lucide-react";

interface UsersFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  planFilter: string;
  onPlanFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  onClear: () => void;
}

const PLANS = ["", "free", "starter", "pro", "business", "enterprise"];
const STATUSES = ["", "active", "suspended", "trial", "churned"];

export default function UsersFilters({
  search,
  onSearchChange,
  planFilter,
  onPlanFilterChange,
  statusFilter,
  onStatusFilterChange,
  onClear,
}: UsersFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Search users..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-64 rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
      </div>
      <select
        value={planFilter}
        onChange={(e) => onPlanFilterChange(e.target.value)}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
      >
        {PLANS.map((p) => (
          <option key={p} value={p}>
            {p || "All plans"}
          </option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s || "All statuses"}
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
