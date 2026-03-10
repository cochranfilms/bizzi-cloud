"use client";

import PageHeader from "../components/shared/PageHeader";
import StorageSummaryRow from "../components/storage/StorageSummaryRow";
import GlobalStorageBar from "../components/storage/GlobalStorageBar";
import StorageCategoryGrid from "../components/storage/StorageCategoryGrid";
import LargestAccountsByStorageTable from "../components/storage/LargestAccountsByStorageTable";
import { useAdminStorage } from "../hooks/useAdminStorage";

export default function StoragePage() {
  const { summary, largestAccounts, loading, error, refresh } = useAdminStorage();

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Storage" subtitle="Platform storage operations" />
        <div className="h-32 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Storage" subtitle="Platform storage operations" />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 text-sm font-medium text-red-700 underline dark:text-red-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalBytes = summary?.totalBytes ?? 0;
  const quotaBytes = summary?.quotaBytes ?? totalBytes * 4;
  const categories = summary?.byCategory ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage"
        subtitle="Storage usage, categories, and top consumers"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
          >
            Refresh
          </button>
        }
      />

      <StorageSummaryRow
        totalBytes={totalBytes}
        quotaBytes={quotaBytes}
        categoriesCount={categories.length}
      />

      <GlobalStorageBar usedBytes={totalBytes} totalBytes={quotaBytes} />

      <div className="grid gap-6 lg:grid-cols-2">
        <StorageCategoryGrid categories={categories} />
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Storage cost impact
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Cost breakdown by tier and category. Connect real cost data from your object storage provider.
          </p>
        </div>
      </div>

      <LargestAccountsByStorageTable accounts={largestAccounts} />
    </div>
  );
}
