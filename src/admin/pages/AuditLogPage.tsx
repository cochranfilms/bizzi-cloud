"use client";

import { useState, useMemo } from "react";
import PageHeader from "../components/shared/PageHeader";
import AuditSummaryRow from "../components/audit/AuditSummaryRow";
import AuditFilters from "../components/audit/AuditFilters";
import AuditLogTable from "../components/audit/AuditLogTable";
import AuditDetailDrawer from "../components/audit/AuditDetailDrawer";
import { useAdminAuditLog } from "../hooks/useAdminAuditLog";
import type { AuditLogEntry } from "../types/adminAudit.types";

export default function AuditLogPage() {
  const { entries, total, loading, error, refresh } = useAdminAuditLog();
  const [actionFilter, setActionFilter] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    if (!actionFilter) return entries;
    return entries.filter((e) => e.action === actionFilter);
  }, [entries, actionFilter]);

  const handleClearFilters = () => setActionFilter("");

  const handleRowClick = (entry: AuditLogEntry) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="Admin actions and sensitive system events"
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

      <AuditSummaryRow total={total} />

      <AuditFilters
        actionFilter={actionFilter}
        onActionFilterChange={setActionFilter}
        onClear={handleClearFilters}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <AuditLogTable
        entries={filteredEntries}
        loading={loading}
        onRowClick={handleRowClick}
      />

      <AuditDetailDrawer
        entry={selectedEntry}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
