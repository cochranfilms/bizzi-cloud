"use client";

import type { PlatformHealthCheck } from "@/admin/types/adminOverview.types";
import StatusBadge from "../shared/StatusBadge";
import { formatRelativeTime } from "@/admin/utils/formatDateTime";

interface PlatformHealthPanelProps {
  checks: PlatformHealthCheck[];
}

export default function PlatformHealthPanel({ checks }: PlatformHealthPanelProps) {
  const criticalCount = checks.filter((c) => c.status === "critical").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;
  const overall =
    criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-neutral-900/50">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Platform Health
        </h3>
        <StatusBadge status={overall} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {checks.map((check) => (
          <div
            key={check.id}
            className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 dark:border-neutral-700"
          >
            <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">
              {check.name}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {check.latencyMs != null && (
                <span className="text-xs text-neutral-500">{check.latencyMs}ms</span>
              )}
              <StatusBadge
                status={check.status}
                severity={
                  check.status === "critical"
                    ? "critical"
                    : check.status === "warning"
                      ? "warning"
                      : "healthy"
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
