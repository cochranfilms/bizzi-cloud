"use client";

import type { AdminFile } from "@/admin/types/adminFiles.types";
import DataTable, { type Column } from "../shared/DataTable";
import { formatBytes } from "@/admin/utils/formatBytes";
import { formatRelativeTime } from "@/admin/utils/formatDateTime";

interface FilesTableProps {
  files: AdminFile[];
  loading?: boolean;
  onRowClick?: (file: AdminFile) => void;
}

export default function FilesTable({
  files,
  loading,
  onRowClick,
}: FilesTableProps) {
  const columns: Column<AdminFile>[] = [
    {
      id: "name",
      header: "Name",
      cell: (r) => (
        <span className="font-medium truncate max-w-[200px] block">{r.name}</span>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      cell: (r) => (
        <span className="text-neutral-600 dark:text-neutral-400">{r.ownerEmail}</span>
      ),
    },
    {
      id: "size",
      header: "Size",
      cell: (r) => formatBytes(r.sizeBytes),
    },
    {
      id: "extension",
      header: "Type",
      cell: (r) => (
        <span className="uppercase text-neutral-500">{r.extension}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span
          className={
            r.status === "trash"
              ? "text-amber-600 dark:text-amber-400"
              : r.status === "archived"
                ? "text-neutral-500"
                : "text-emerald-600 dark:text-emerald-400"
          }
        >
          {r.status}
        </span>
      ),
    },
    {
      id: "modified",
      header: "Modified",
      cell: (r) => formatRelativeTime(r.modifiedAt),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={files}
      loading={loading}
      keyExtractor={(r) => r.id}
      onRowClick={onRowClick}
    />
  );
}
