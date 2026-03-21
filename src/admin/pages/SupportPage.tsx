"use client";

import { useState } from "react";
import PageHeader from "../components/shared/PageHeader";
import SupportSummaryRow from "../components/support/SupportSummaryRow";
import SupportIssueBreakdown from "../components/support/SupportIssueBreakdown";
import SupportTicketsTable from "../components/support/SupportTicketsTable";
import SupportTicketDrawer from "../components/support/SupportTicketDrawer";
import { useAdminSupport } from "../hooks/useAdminSupport";
import type { SupportTicket } from "../types/adminSupport.types";

export default function SupportPage() {
  const { tickets, total, breakdown, loading, error, refresh } = useAdminSupport();
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const urgentCount = tickets.filter((t) => t.priority === "urgent").length;

  const handleRowClick = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle="Support tickets and operations queue"
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

      <SupportSummaryRow
        total={openCount + inProgressCount}
        open={inProgressCount}
        urgent={urgentCount}
      />

      <SupportIssueBreakdown breakdown={breakdown} />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <SupportTicketsTable
        tickets={tickets}
        loading={loading}
        onRowClick={handleRowClick}
      />

      <SupportTicketDrawer
        ticket={selectedTicket}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => void refresh()}
      />
    </div>
  );
}
