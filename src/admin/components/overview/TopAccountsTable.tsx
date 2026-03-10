"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TopAccount } from "@/admin/types/adminOverview.types";
import DataTable, { type Column } from "../shared/DataTable";
import { formatBytes } from "@/admin/utils/formatBytes";
import { formatCurrency } from "@/admin/utils/formatCurrency";
import { formatRelativeTime } from "@/admin/utils/formatDateTime";
import { mapPlanToLabel } from "@/admin/utils/mapPlanToLabel";

interface TopAccountsTableProps {
  accounts: TopAccount[];
}

export default function TopAccountsTable({ accounts }: TopAccountsTableProps) {
  const router = useRouter();
  const columns: Column<TopAccount>[] = [
    {
      id: "name",
      header: "Account",
      cell: (r) => (
        <Link
          href={`/admin/users?highlight=${r.id}`}
          className="font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
        >
          {r.name || r.email}
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
      id: "plan",
      header: "Plan",
      cell: (r) => mapPlanToLabel(r.plan),
    },
    {
      id: "storage",
      header: "Storage",
      cell: (r) => formatBytes(r.storageUsedBytes),
    },
    {
      id: "revenue",
      header: "Revenue",
      cell: (r) =>
        r.revenueMonth > 0 ? formatCurrency(r.revenueMonth) : "—",
    },
    {
      id: "risk",
      header: "Risk",
      cell: (r) =>
        r.riskScore != null ? (
          <span
            className={
              r.riskScore > 50
                ? "text-amber-600 dark:text-amber-400"
                : "text-neutral-600 dark:text-neutral-400"
            }
          >
            {r.riskScore}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "lastActive",
      header: "Last Active",
      cell: (r) => formatRelativeTime(r.lastActive),
    },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-neutral-900/50">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Top accounts by storage, revenue & risk
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
