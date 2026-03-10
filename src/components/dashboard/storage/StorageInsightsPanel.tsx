"use client";

import { formatBytes } from "@/lib/analytics/format-bytes";
import type { StorageAnalyticsData } from "@/hooks/useStorageAnalytics";

interface StorageInsightsPanelProps {
  data: StorageAnalyticsData;
  basePath?: string;
}

export default function StorageInsightsPanel({
  data,
  basePath = "/dashboard",
}: StorageInsightsPanelProps) {
  const insights: Array<{
    title: string;
    value: string;
    description?: string;
    action?: { label: string; href: string };
  }> = [];

  if (data.largestFiles.length > 0) {
    const top = data.largestFiles[0]!;
    insights.push({
      title: "Largest file",
      value: `${top.name} (${formatBytes(top.size)})`,
      action: { label: "View largest files", href: `${basePath}/files?sort=largest` },
    });
  }

  if (data.fastestGrowingCategory) {
    insights.push({
      title: "Fastest growing this month",
      value: data.fastestGrowingCategory,
    });
  }

  if (data.oldFiles90DaysCount != null && data.oldFiles90DaysCount > 0) {
    insights.push({
      title: "Files not opened in 90+ days",
      value: `${data.oldFiles90DaysCount.toLocaleString()} files`,
      description: "Consider archiving or deleting to free space",
      action: { label: "View files", href: `${basePath}/files?date=old` },
    });
  }

  if (data.archivedBytes > 0) {
    insights.push({
      title: "Archived storage",
      value: formatBytes(data.archivedBytes),
      description: `vs ${formatBytes(data.activeBytes - data.archivedBytes)} active`,
    });
  }

  if (data.sharedBytes > 0) {
    insights.push({
      title: "Shared files",
      value: formatBytes(data.sharedBytes),
    });
  }

  if (data.trashBytes > 0) {
    insights.push({
      title: "In trash",
      value: formatBytes(data.trashBytes),
      description: "Empty trash to free this space",
      action: { label: "View trash", href: `${basePath}/trash` },
    });
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Storage insights
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Upload more files to see insights and cleanup suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        Storage insights
      </h3>
      <ul className="space-y-4">
        {insights.map((insight, i) => (
          <li key={i}>
            <div className="font-medium text-neutral-900 dark:text-white">
              {insight.title}
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              {insight.value}
            </div>
            {insight.description && (
              <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                {insight.description}
              </div>
            )}
            {insight.action && (
              <a
                href={insight.action.href}
                className="mt-1 inline-block text-sm font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
              >
                {insight.action.label}
              </a>
            )}
          </li>
        ))}
      </ul>
      {data.largestFiles.length > 1 && (
        <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Largest files
          </h4>
          <ul className="space-y-1">
            {data.largestFiles.slice(0, 5).map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span
                  className="truncate text-neutral-700 dark:text-neutral-300"
                  title={f.name}
                >
                  {f.name}
                </span>
                <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                  {formatBytes(f.size)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
