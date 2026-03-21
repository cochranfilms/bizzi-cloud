"use client";

import Link from "next/link";
import type { AdminAlert } from "@/admin/types/adminAlerts.types";
import DataTable, { type Column } from "../shared/DataTable";
import StatusBadge from "../shared/StatusBadge";
import { formatRelativeTime } from "@/admin/utils/formatDateTime";
import EmptyState from "../shared/EmptyState";
import { Bell } from "lucide-react";

interface AlertsTableProps {
  alerts: AdminAlert[];
  loading?: boolean;
  onRowClick?: (alert: AdminAlert) => void;
}

export default function AlertsTable({
  alerts,
  loading,
  onRowClick,
}: AlertsTableProps) {
  const columns: Column<AdminAlert>[] = [
    {
      id: "severity",
      header: "Severity",
      cell: (r) => (
        <StatusBadge
          status={r.severity}
          severity={
            r.severity === "critical"
              ? "critical"
              : r.severity === "warning"
                ? "warning"
                : "info"
          }
        />
      ),
    },
    {
      id: "title",
      header: "Title",
      cell: (r) => (
        <span className="font-medium">{r.title}</span>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: (r) => (
        <span className="text-neutral-600 dark:text-neutral-400">{r.source}</span>
      ),
    },
    {
      id: "timestamp",
      header: "Time",
      cell: (r) => formatRelativeTime(r.timestamp),
    },
    {
      id: "action",
      header: "Action",
      cell: (r) => {
        const ticketId = (r.metadata as { ticketId?: string })?.ticketId;
        if (ticketId) {
          return (
            <Link
              href={`/admin/support?ticket=${ticketId}`}
              className="text-sm text-bizzi-blue hover:underline dark:text-bizzi-cyan"
              onClick={(e) => e.stopPropagation()}
            >
              View ticket
            </Link>
          );
        }
        if (r.recommendedAction) {
          return <span className="text-sm text-neutral-500">{r.recommendedAction}</span>;
        }
        if (r.targetUserId) {
          return (
            <Link
              href={`/admin/users?highlight=${r.targetUserId}`}
              className="text-sm text-bizzi-blue hover:underline dark:text-bizzi-cyan"
              onClick={(e) => e.stopPropagation()}
            >
              View user
            </Link>
          );
        }
        return "—";
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={alerts}
      loading={loading}
      keyExtractor={(r) => r.id}
      onRowClick={onRowClick}
      emptyState={
        <EmptyState
          icon={Bell}
          title="No active alerts"
          description="All systems operational"
        />
      }
    />
  );
}
