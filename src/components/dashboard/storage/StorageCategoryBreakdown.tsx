"use client";

import Link from "next/link";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { STORAGE_CATEGORY_COLORS } from "@/lib/analytics/storage-colors";
import type { CategoryAggregate } from "@/lib/analytics/aggregate";

interface StorageCategoryBreakdownProps {
  categories: CategoryAggregate[];
  basePath?: string;
}

export default function StorageCategoryBreakdown({
  categories,
  basePath = "/dashboard",
}: StorageCategoryBreakdownProps) {
  const withData = categories.filter((c) => c.bytes > 0);

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        Storage by category
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {withData.map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${STORAGE_CATEGORY_COLORS[cat.id] ?? "bg-gray-400"}`}
                aria-hidden
              />
              <span className="font-medium text-neutral-900 dark:text-white">
                {cat.label}
              </span>
            </div>
            <div className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
              {formatBytes(cat.bytes)}
            </div>
            <div className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
              {cat.percent.toFixed(1)}% of total · {cat.count.toLocaleString()}{" "}
              files
            </div>
            {cat.avgSize != null && cat.avgSize > 0 && (
              <div className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
                Avg file: {formatBytes(cat.avgSize)}
              </div>
            )}
            {cat.largestFile && (
              <div className="mb-3 truncate text-xs text-neutral-400 dark:text-neutral-500" title={cat.largestFile.name}>
                Largest: {cat.largestFile.name}
              </div>
            )}
            <Link
              href={`${basePath}/files`}
              className="text-sm font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
            >
              View files
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
