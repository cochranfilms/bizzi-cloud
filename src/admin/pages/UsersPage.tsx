"use client";

import { useState, useMemo } from "react";
import PageHeader from "../components/shared/PageHeader";
import UsersSummaryRow from "../components/users/UsersSummaryRow";
import UsersFilters from "../components/users/UsersFilters";
import UserDetailDrawer from "../components/users/UserDetailDrawer";
import DataTable, { type Column } from "../components/shared/DataTable";
import EmptyState from "../components/shared/EmptyState";
import { useAdminUsers } from "../hooks/useAdminUsers";
import type { AdminUser } from "../types/adminUsers.types";
import { formatBytes } from "../utils/formatBytes";
import { formatCurrency } from "../utils/formatCurrency";
import { formatRelativeTime } from "../utils/formatDateTime";
import { mapPlanToLabel } from "../utils/mapPlanToLabel";
import { Users } from "lucide-react";

export default function UsersPage() {
  const {
    users,
    total,
    loading,
    error,
    filters,
    setFilters,
    refresh,
  } = useAdminUsers();

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (filters.status) list = list.filter((u) => u.status === filters.status);
    return list;
  }, [users, filters.status]);

  const handleClearFilters = () => {
    setFilters({ search: "", plan: "", status: "" });
  };

  const handleRowClick = (user: AdminUser) => {
    setSelectedUser(user);
    setDrawerOpen(true);
  };

  const columns: Column<AdminUser>[] = [
    {
      id: "name",
      header: "Name",
      cell: (r) => (
        <span className="font-medium">{r.displayName || r.email}</span>
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
      id: "status",
      header: "Status",
      cell: (r) => (
        <span
          className={
            r.status === "suspended"
              ? "text-amber-600 dark:text-amber-400"
              : r.status === "active"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-neutral-500"
          }
        >
          {r.status}
        </span>
      ),
    },
    {
      id: "storage",
      header: "Storage",
      cell: (r) => formatBytes(r.storageUsedBytes),
    },
    {
      id: "lastActive",
      header: "Last active",
      cell: (r) =>
        r.lastActive ? formatRelativeTime(r.lastActive) : "—",
    },
    {
      id: "revenue",
      header: "Revenue",
      cell: (r) =>
        r.revenueGenerated > 0 ? formatCurrency(r.revenueGenerated) : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Search, filter, and manage platform users"
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

      <UsersSummaryRow total={total} active={users.filter((u) => u.status === "active").length} newThisMonth={0} />

      <UsersFilters
        search={filters.search ?? ""}
        onSearchChange={(v) => setFilters((prev) => ({ ...prev, search: v }))}
        planFilter={filters.plan ?? ""}
        onPlanFilterChange={(v) => setFilters((prev) => ({ ...prev, plan: v }))}
        statusFilter={filters.status ?? ""}
        onStatusFilterChange={(v) => setFilters((prev) => ({ ...prev, status: v }))}
        onClear={handleClearFilters}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filteredUsers}
        loading={loading}
        keyExtractor={(r) => r.id}
        onRowClick={handleRowClick}
        emptyState={
          <EmptyState
            icon={Users}
            title="No users found"
            description="Try adjusting your filters"
          />
        }
      />

      <UserDetailDrawer
        user={selectedUser}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
