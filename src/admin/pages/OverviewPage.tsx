"use client";

import { RefreshCw, Loader2 } from "lucide-react";
import PageHeader from "../components/shared/PageHeader";
import LoadingSkeleton from "../components/shared/LoadingSkeleton";
import ExecutiveSummaryGrid from "../components/overview/ExecutiveSummaryGrid";
import PlatformHealthPanel from "../components/overview/PlatformHealthPanel";
import CriticalAlertsPanel from "../components/overview/CriticalAlertsPanel";
import RevenueSnapshotCard from "../components/overview/RevenueSnapshotCard";
import StorageSnapshotCard from "../components/overview/StorageSnapshotCard";
import UserActivitySnapshotCard from "../components/overview/UserActivitySnapshotCard";
import CostIntelligenceCard from "../components/overview/CostIntelligenceCard";
import TopAccountsTable from "../components/overview/TopAccountsTable";
import OverviewChartsGrid from "../components/overview/OverviewChartsGrid";
import { useAdminOverview } from "../hooks/useAdminOverview";

export default function OverviewPage() {
  const {
    metrics,
    health,
    alerts,
    topAccounts,
    revenueTrend,
    loading,
    error,
    refresh,
    systemStatus,
  } = useAdminOverview();

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" subtitle="Platform command center" />
        <LoadingSkeleton lines={6} className="h-32" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" subtitle="Platform command center" />
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

  const storagePercent =
    metrics && metrics.totalStorageAvailableBytes
      ? (metrics.totalStorageBytes / (metrics.totalStorageBytes + metrics.totalStorageAvailableBytes)) * 100
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle="Platform health, revenue, storage, and activity at a glance"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        }
      />

      <ExecutiveSummaryGrid
        platformHealth={systemStatus}
        revenue={metrics?.mrr ?? 0}
        storageUsedBytes={metrics?.totalStorageBytes ?? 0}
        storagePercent={storagePercent ?? undefined}
        activeUsersToday={metrics?.activeUsersToday ?? 0}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PlatformHealthPanel checks={health} />
        <CriticalAlertsPanel alerts={alerts} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <RevenueSnapshotCard
          mrr={metrics?.mrr ?? 0}
          grossMarginPercent={metrics?.grossMarginPercent}
          infraCost={metrics?.estimatedInfraCost}
        />
        <CostIntelligenceCard
          mrr={metrics?.mrr ?? 0}
          infraCost={metrics?.estimatedInfraCost}
          grossMarginPercent={metrics?.grossMarginPercent}
        />
        <StorageSnapshotCard
          totalUsedBytes={metrics?.totalStorageBytes ?? 0}
          totalAvailableBytes={metrics?.totalStorageAvailableBytes ?? null}
          avgPerUserBytes={metrics?.avgStoragePerUserBytes ?? 0}
        />
        <UserActivitySnapshotCard
          totalUsers={metrics?.totalUsers ?? 0}
          activeToday={metrics?.activeUsersToday ?? 0}
          activeMonth={metrics?.activeUsersMonth ?? 0}
          newSignups={metrics?.newSignups}
          uploadsToday={metrics?.uploadsToday ?? 0}
        />
      </div>

      <OverviewChartsGrid revenueTrend={revenueTrend} />
      <TopAccountsTable accounts={topAccounts} />
    </div>
  );
}
