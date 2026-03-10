"use client";

import Link from "next/link";
import type { AuditLogEntry } from "@/admin/types/adminAudit.types";
import DataTable, { type Column } from "../shared/DataTable";
import { formatDateTime } from "@/admin/utils/formatDateTime";

interface AuditLogTableProps {
  entries: AuditLogEntry[];
  loading?: boolean;
  onRowClick?: (entry: AuditLogEntry) => void;
}

export default function AuditLogTable({
  entries,
  loading,
  onRowClick,
}: AuditLogTableProps) {
  const columns: Column<AuditLogEntry>[] = [
    {
      id: "timestamp",
      header: "Time",
      cell: (r) => (
        <span className="text-neutral-600 dark:text-neutral-400">
          {formatDateTime(r.timestamp)}
        </span>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      cell: (r) => (
        <span className="font-medium">{r.actorEmail}</span>
      ),
    },
    {
      id: "action",
      header: "Action",
      cell: (r) => (
        <span className="font-mono text-xs">{r.action}</span>
      ),
    },
    {
      id: "target",
      header: "Target",
      cell: (r) =>
        r.targetId ? (
          <Link
            href={
              r.targetType === "user"
                ? `/admin/users?highlight=${r.targetId}`
                : r.targetType === "file"
                  ? `/admin/files?file=${r.targetId}`
                  : "#"
            }
            className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
          >
            {r.targetType}:{r.targetId}
          </Link>
        ) : (
          <span className="text-neutral-500">—</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={entries}
      loading={loading}
      keyExtractor={(r) => r.id}
      onRowClick={onRowClick}
    />
  );
}
