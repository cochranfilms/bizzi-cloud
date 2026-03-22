"use client";

import { TrendingUp, AlertTriangle } from "lucide-react";
import { useAdminFormatCurrency } from "@/context/AdminDisplayContext";

interface CostIntelligenceCardProps {
  mrr: number;
  infraCost?: number | null;
  grossMarginPercent?: number | null;
  costTrendVsRevenue?: "ok" | "warning" | "critical";
}

export default function CostIntelligenceCard({
  mrr,
  infraCost = 0,
  grossMarginPercent,
  costTrendVsRevenue = "ok",
}: CostIntelligenceCardProps) {
  const formatCurrency = useAdminFormatCurrency();
  const hasCostData = infraCost != null && infraCost > 0 && grossMarginPercent != null;
  const profit = hasCostData ? mrr - infraCost : null;
  const isHealthy = grossMarginPercent != null && grossMarginPercent >= 60;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-neutral-900/50">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        <TrendingUp className="h-4 w-4" />
        Cost intelligence
      </h3>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-neutral-500">Revenue</span>
          <span className="font-medium">{formatCurrency(mrr)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-neutral-500">Infra cost</span>
          <span>{hasCostData ? formatCurrency(infraCost) : "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-neutral-500">Gross margin</span>
          <span
            className={
              hasCostData
                ? isHealthy
                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                  : "font-medium text-amber-600 dark:text-amber-400"
                : "text-neutral-400"
            }
          >
            {hasCostData ? `${grossMarginPercent}%` : "—"}
          </span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-2 text-sm dark:border-neutral-700">
          <span className="text-neutral-500">Estimated profit</span>
          <span className="font-medium">{profit != null ? formatCurrency(profit) : "—"}</span>
        </div>
      </div>
      {costTrendVsRevenue !== "ok" && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-800 dark:text-amber-200">
            {costTrendVsRevenue === "warning"
              ? "Storage cost growth approaching revenue growth."
              : "Cost growth exceeds revenue growth. Review storage usage."}
          </span>
        </div>
      )}
    </div>
  );
}
