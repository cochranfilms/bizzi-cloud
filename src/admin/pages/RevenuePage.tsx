"use client";

import PageHeader from "../components/shared/PageHeader";
import RevenueSummaryRow from "../components/revenue/RevenueSummaryRow";
import MRRChart from "../components/revenue/MRRChart";
import RevenueByPlanChart from "../components/revenue/RevenueByPlanChart";
import CostVsRevenueChart from "../components/revenue/CostVsRevenueChart";
import { useAdminRevenue } from "../hooks/useAdminRevenue";

export default function RevenuePage() {
  const { summary, byPlan, trend, loading, error, refresh } = useAdminRevenue();

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Revenue" subtitle="Business metrics" />
        <div className="h-32 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Revenue" subtitle="Business metrics" />
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
        title="Revenue"
        subtitle="MRR, conversion, and cost metrics"
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

      <RevenueSummaryRow
        mrr={summary?.mrr ?? 0}
        arr={summary?.arr ?? 0}
        payingUsers={summary?.payingUsers ?? 0}
        conversionRate={summary?.conversionRate ?? 0}
        arpu={summary?.arpu ?? 0}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <MRRChart data={trend} />
        <CostVsRevenueChart data={trend} />
      </div>

      <RevenueByPlanChart data={byPlan} />
    </div>
  );
}
