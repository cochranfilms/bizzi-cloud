"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StorageAccount } from "@/admin/types/adminStorage.types";
import DataTable, { type Column } from "../shared/DataTable";
import { formatBytes } from "@/admin/utils/formatBytes";
import { formatPercentage } from "@/admin/utils/formatPercentage";

interface LargestAccountsByStorageTableProps {
  accounts: StorageAccount[];
}

export default function LargestAccountsByStorageTable({
  accounts,
}: LargestAccountsByStorageTableProps) {
  const router = useRouter();
  const columns: Column<StorageAccount>[] = [
    {
      id: "name",
      header: "Account",
      cell: (r) => (
        <Link
          href={`/admin/users?highlight=${r.id}`}
          className="font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
        >
          {r.name}
        </Link>
      ),
    },
    {
      id: "email",
      header: "Email",
      cell: (r) => (
        <span className="text-neutral-600 dark:text-neutral-400">{r.email}</span>
      ),
    },
    {
      id: "bytes",
      header: "Storage",
      cell: (r) => formatBytes(r.bytes),
    },
    {
      id: "growth",
      header: "Growth",
      cell: (r) => (
        <span
          className={
            r.growthPercent > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : r.growthPercent < 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-neutral-500"
          }
        >
          {r.growthPercent > 0 ? "+" : ""}
          {formatPercentage(r.growthPercent)}
        </span>
      ),
    },
    {
      id: "files",
      header: "Files",
      cell: (r) => r.fileCount.toLocaleString(),
    },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Largest accounts by storage
      </h3>
      <DataTable
        columns={columns}
        rows={accounts}
        keyExtractor={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/users?highlight=${r.id}`)}
      />
    </div>
  );
}
