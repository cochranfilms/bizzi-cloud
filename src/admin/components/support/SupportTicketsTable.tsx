"use client";

import Link from "next/link";
import type { SupportTicket } from "@/admin/types/adminSupport.types";
import DataTable, { type Column } from "../shared/DataTable";
import { formatRelativeTime } from "@/admin/utils/formatDateTime";
import EmptyState from "../shared/EmptyState";
import { MessageSquare } from "lucide-react";

interface SupportTicketsTableProps {
  tickets: SupportTicket[];
  loading?: boolean;
  onRowClick?: (ticket: SupportTicket) => void;
}

export default function SupportTicketsTable({
  tickets,
  loading,
  onRowClick,
}: SupportTicketsTableProps) {
  const columns: Column<SupportTicket>[] = [
    {
      id: "priority",
      header: "Priority",
      cell: (r) => (
        <span
          className={
            r.priority === "urgent"
              ? "text-red-600 dark:text-red-400"
              : r.priority === "high"
                ? "text-amber-600 dark:text-amber-400"
                : "text-neutral-500"
          }
        >
          {r.priority}
        </span>
      ),
    },
    {
      id: "subject",
      header: "Subject",
      cell: (r) => <span className="font-medium">{r.subject}</span>,
    },
    {
      id: "type",
      header: "Type",
      cell: (r) => (
        <span className="text-neutral-600 dark:text-neutral-400">
          {r.issueType}
        </span>
      ),
    },
    {
      id: "user",
      header: "Affected user",
      cell: (r) => (
        <Link
          href={`/admin/users?highlight=${r.affectedUserId}`}
          className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
        >
          {r.affectedUserEmail}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span
          className={
            r.status === "open"
              ? "text-amber-600 dark:text-amber-400"
              : r.status === "in_progress"
                ? "text-blue-600 dark:text-blue-400"
                : "text-emerald-600 dark:text-emerald-400"
          }
        >
          {r.status}
        </span>
      ),
    },
    {
      id: "updated",
      header: "Last update",
      cell: (r) => formatRelativeTime(r.updatedAt),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={tickets}
      loading={loading}
      keyExtractor={(r) => r.id}
      onRowClick={onRowClick}
      emptyState={
        <EmptyState
          icon={MessageSquare}
          title="No support tickets"
          description="All clear!"
        />
      }
    />
  );
}
