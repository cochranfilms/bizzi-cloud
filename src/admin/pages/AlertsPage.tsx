"use client";

import { useState } from "react";
import PageHeader from "../components/shared/PageHeader";
import AlertsSummaryRow from "../components/alerts/AlertsSummaryRow";
import AlertsTable from "../components/alerts/AlertsTable";
import AlertDetailDrawer from "../components/alerts/AlertDetailDrawer";
import { useAdminAlerts } from "../hooks/useAdminAlerts";
import type { AdminAlert } from "../types/adminAlerts.types";

export default function AlertsPage() {
  const { alerts, loading, error, refresh } = useAdminAlerts();
  const [selectedAlert, setSelectedAlert] = useState<AdminAlert | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;

  const handleRowClick = (alert: AdminAlert) => {
    setSelectedAlert(alert);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        subtitle="Platform alerts and incidents"
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

      <AlertsSummaryRow total={alerts.length} critical={critical} warning={warning} />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <AlertsTable alerts={alerts} loading={loading} onRowClick={handleRowClick} />

      <AlertDetailDrawer
        alert={selectedAlert}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
