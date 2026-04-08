"use client";

import Link from "next/link";

interface StorageQuickFiltersProps {
  basePath?: string;
}

const QUICK_FILTERS: Array<{
  label: string;
  params: Record<string, string>;
}> = [
  { label: "Videos", params: { media_type: "video" } },
  { label: "Photos", params: { media_type: "photo" } },
  { label: "Archived", params: { usage_status: "archived" } },
  { label: "Largest first", params: { sort: "largest" } },
  { label: "Oldest first", params: { sort: "oldest" } },
];

export default function StorageQuickFilters({
  basePath = "/dashboard",
}: StorageQuickFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Quick filters:
      </span>
      {QUICK_FILTERS.map(({ label, params }) => {
        const query = new URLSearchParams(params).toString();
        const href = query ? `${basePath}?${query}` : basePath;
        return (
          <Link
            key={label}
            href={href}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 hover:border-bizzi-blue/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:border-bizzi-cyan/30"
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
