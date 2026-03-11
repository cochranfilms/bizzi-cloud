"use client";

import PageHeader from "../components/shared/PageHeader";
import UploadSummaryRow from "../components/uploads/UploadSummaryRow";
import UploadVolumeChart from "../components/uploads/UploadVolumeChart";
import UploadFailuresPanel from "../components/uploads/UploadFailuresPanel";
import { useAdminUploads } from "../hooks/useAdminUploads";

export default function UploadAnalyticsPage() {
  const { metrics, volume, failures, loading, error, refresh, refreshing } = useAdminUploads();

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <PageHeader title="Upload Analytics" subtitle="Upload success rate and performance" />
        <div className="h-32 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Upload Analytics" subtitle="Upload success rate and performance" />
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload Analytics"
        subtitle="Upload success rate, volume, failures, and transfer performance"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium transition-opacity dark:border-neutral-700 dark:bg-neutral-800 disabled:opacity-70 disabled:cursor-wait"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      <UploadSummaryRow
        countToday={metrics?.countToday ?? 0}
        successRate={metrics?.successRate ?? 0}
        avgSpeedMbps={metrics?.avgSpeedMbps ?? 0}
        failedCount={metrics?.failedCount ?? 0}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <UploadVolumeChart data={volume} />
        <UploadFailuresPanel failures={failures} />
      </div>
    </div>
  );
}
