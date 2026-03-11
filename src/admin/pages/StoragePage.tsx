"use client";

import PageHeader from "../components/shared/PageHeader";
import StorageSummaryRow from "../components/storage/StorageSummaryRow";
import GlobalStorageBar from "../components/storage/GlobalStorageBar";
import StorageCategoryGrid from "../components/storage/StorageCategoryGrid";
import LargestAccountsByStorageTable from "../components/storage/LargestAccountsByStorageTable";
import { useAdminStorage } from "../hooks/useAdminStorage";
import { formatBytes } from "../utils/formatBytes";

export default function StoragePage() {
  const {
    summary,
    largestAccounts,
    bucketStats,
    orphanResult,
    loading,
    loadingBucket,
    loadingOrphan,
    error,
    refresh,
    loadBucketStats,
    runOrphanCheck,
  } = useAdminStorage();

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

      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Bucket vs platform
        </h4>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Platform totals come from Firestore. Bucket totals are the actual B2 storage. Compare to spot orphaned files or drift.
        </p>
        {bucketStats ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Platform (Firestore)</span>
              <span className="font-medium">{formatBytes(totalBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span>Bucket content/</span>
              <span className="font-medium">
                {formatBytes(bucketStats.content.totalBytes)} ({bucketStats.content.objectCount} objects)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Bucket total</span>
              <span className="font-medium">
                {formatBytes(bucketStats.all.totalBytes)} ({bucketStats.all.objectCount} objects)
              </span>
            </div>
            {bucketStats.note && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{bucketStats.note}</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void loadBucketStats()}
            disabled={loadingBucket}
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800 disabled:opacity-50"
          >
            {loadingBucket ? "Loading…" : "Load bucket stats"}
          </button>
        )}
      </div>

      <GlobalStorageBar usedBytes={totalBytes} totalBytes={quotaBytes} />

      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Orphan cleanup
        </h4>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Find and delete B2 content/ objects not referenced by any backup_file (e.g. from permanent deletes before this fix).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runOrphanCheck(true)}
            disabled={loadingOrphan}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800 disabled:opacity-50"
          >
            {loadingOrphan ? "Checking…" : "Check for orphans"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                orphanResult?.orphanCount &&
                window.confirm(
                  `Delete ${orphanResult.orphanCount} orphan objects from B2? This cannot be undone.`
                )
              ) {
                void runOrphanCheck(false);
              }
            }}
            disabled={loadingOrphan || !orphanResult?.orphanCount}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 disabled:opacity-50"
          >
            Delete orphans
          </button>
        </div>
        {orphanResult && (
          <div className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {orphanResult.dryRun
              ? `Found ${orphanResult.orphanCount} orphans (dry run). Referenced in DB: ${orphanResult.referencedCount}, checked ${orphanResult.checked} bucket objects.`
              : `Deleted ${orphanResult.deleted} objects.`}
          </div>
        )}
      </div>

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
