"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { CriticalAlert } from "@/admin/types/adminOverview.types";
import { formatRelativeTime } from "@/admin/utils/formatDateTime";

interface CriticalAlertsPanelProps {
  alerts: CriticalAlert[];
}

export default function CriticalAlertsPanel({ alerts }: CriticalAlertsPanelProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-neutral-900/50">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Active Alerts
        </h3>
        {alerts.length > 0 && (
          <Link
            href="/admin/alerts"
            className="text-xs font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
          >
            View all
          </Link>
        )}
      </div>
      {alerts.length === 0 ? (
        <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
          No active alerts
        </p>
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="rounded-lg border border-neutral-100 p-3 dark:border-neutral-700"
            >
              <div className="flex gap-2">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    alert.severity === "critical"
                      ? "text-red-500"
                      : "text-amber-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">
                    {alert.title}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {alert.source} · {formatRelativeTime(alert.timestamp)}
                  </p>
                  {alert.recommendedAction && (
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                      → {alert.recommendedAction}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
