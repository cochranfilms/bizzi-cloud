"use client";

import { useStorageAnalytics } from "@/hooks/useStorageAnalytics";
import StorageSummaryCard from "./StorageSummaryCard";
import SegmentedStorageBar from "./SegmentedStorageBar";
import StorageCategoryBreakdown from "./StorageCategoryBreakdown";
import StorageInsightsPanel from "./StorageInsightsPanel";
import StorageGrowthChart from "./StorageGrowthChart";
import FileTypeDistributionChart from "./FileTypeDistributionChart";
import StorageQuickFilters from "./StorageQuickFilters";
import StorageSkeleton from "./StorageSkeleton";

interface StorageAnalyticsPageProps {
  basePath?: string;
}

export default function StorageAnalyticsPage({
  basePath = "/dashboard",
}: StorageAnalyticsPageProps) {
  const { data, loading, error, refetch } = useStorageAnalytics();

  if (loading) {
    return <StorageSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/30">
        <p className="font-medium text-red-800 dark:text-red-300">
          Failed to load storage analytics
        </p>
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-neutral-600 dark:text-neutral-400">
          No storage data available.
        </p>
      </div>
    );
  }

  const hasFiles = data.totalFileCount > 0 || data.totalUsedBytes > 0;

  if (!hasFiles) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className="mb-2 text-lg font-medium text-neutral-900 dark:text-white">
            No files yet
          </p>
          <p className="mb-6 text-neutral-600 dark:text-neutral-400">
            Upload files to see your storage breakdown and analytics.
          </p>
          <a
            href={`${basePath}/files`}
            className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 font-medium text-white transition-colors hover:bg-bizzi-blue/90 dark:bg-bizzi-cyan dark:text-neutral-900 dark:hover:bg-bizzi-cyan/90"
          >
            Go to All files
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <StorageSummaryCard data={data} basePath={basePath} onRefresh={refetch} />
      <div>
        <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Storage breakdown
        </h3>
        <SegmentedStorageBar
          categories={data.categories}
          totalUsedBytes={data.totalUsedBytes}
          totalQuotaBytes={data.totalQuotaBytes}
        />
      </div>
      <StorageCategoryBreakdown
        categories={data.categories}
        basePath={basePath}
      />
      <StorageQuickFilters basePath={basePath} />
      <StorageInsightsPanel data={data} basePath={basePath} />
      <div className="grid gap-6 lg:grid-cols-2">
        <StorageGrowthChart monthlyUploads={data.monthlyUploads} />
        <FileTypeDistributionChart categories={data.categories} />
      </div>
    </div>
  );
}
