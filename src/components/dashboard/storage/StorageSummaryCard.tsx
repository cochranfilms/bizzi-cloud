"use client";

import { formatBytes } from "@/lib/analytics/format-bytes";
import type { StorageAnalyticsData } from "@/hooks/useStorageAnalytics";

interface StorageSummaryCardProps {
  data: StorageAnalyticsData;
  basePath?: string;
  onRefresh?: () => void | Promise<void>;
}

export default function StorageSummaryCard({
  data,
  basePath = "/dashboard",
  onRefresh,
}: StorageSummaryCardProps) {
  const percentUsed =
    data.totalQuotaBytes != null && data.totalQuotaBytes > 0
      ? (data.totalUsedBytes / data.totalQuotaBytes) * 100
      : 0;

  const trendThisMonth = data.uploadBytesThisMonth ?? 0;
  const trendLastMonth = data.uploadBytesLastMonth ?? 0;
  const trendDelta =
    trendLastMonth > 0
      ? ((trendThisMonth - trendLastMonth) / trendLastMonth) * 100
      : trendThisMonth > 0
        ? 100
        : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-neutral-900/50">
      <h2 className="mb-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
        Storage overview
      </h2>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-semibold text-neutral-900 dark:text-white">
          {formatBytes(data.totalUsedBytes)} of{" "}
          {data.totalQuotaBytes != null
            ? formatBytes(data.totalQuotaBytes)
            : "Unlimited"}{" "}
          used
        </span>
      </div>
      <div className="mb-4 flex flex-wrap gap-4 text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          {data.totalQuotaBytes != null && (
            <>
              {formatBytes(data.remainingBytes)} remaining
              <span className="mx-2">·</span>
            </>
          )}
          {percentUsed.toFixed(1)}% used
        </span>
        <span>{data.totalFileCount.toLocaleString()} files</span>
        {data.largestFileType && (
          <span>Largest type: {data.largestFileType}</span>
        )}
      </div>
      {(trendThisMonth > 0 || trendLastMonth > 0) && (
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          This month: {formatBytes(trendThisMonth)} uploaded
          {trendLastMonth > 0 && (
            <span
              className={
                trendDelta > 0
                  ? " text-emerald-600 dark:text-emerald-400"
                  : trendDelta < 0
                    ? " text-amber-600 dark:text-amber-400"
                    : ""
              }
            >
              {" "}
              ({trendDelta > 0 ? "+" : ""}
              {trendDelta.toFixed(0)}% vs last month)
            </span>
          )}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Last updated{" "}
          {new Date(data.lastUpdated).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
        {onRefresh && (
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="text-xs text-bizzi-blue underline hover:no-underline dark:text-bizzi-cyan"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
