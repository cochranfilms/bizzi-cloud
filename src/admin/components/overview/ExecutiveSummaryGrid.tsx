"use client";

import { Activity, DollarSign, HardDrive, Users } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";
import { formatBytes } from "@/admin/utils/formatBytes";
import { useAdminFormatCurrency } from "@/context/AdminDisplayContext";

interface ExecutiveSummaryGridProps {
  platformHealth: "healthy" | "warning" | "critical";
  revenue: number;
  storageUsedBytes: number;
  storagePercent?: number;
  activeUsersToday: number;
}

export default function ExecutiveSummaryGrid({
  platformHealth,
  revenue,
  storageUsedBytes,
  storagePercent,
  activeUsersToday,
}: ExecutiveSummaryGridProps) {
  const formatCurrency = useAdminFormatCurrency();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="Platform Health"
        value={platformHealth.charAt(0).toUpperCase() + platformHealth.slice(1)}
        status={platformHealth === "critical" ? "critical" : platformHealth === "warning" ? "warning" : "healthy"}
      />
      <SummaryCard label="MRR" value={formatCurrency(revenue)} />
      <SummaryCard
        label="Storage Cost"
        value={formatBytes(storageUsedBytes)}
        subtitle={storagePercent != null ? `${storagePercent.toFixed(1)}% used` : undefined}
      />
      <SummaryCard label="Active Users Today" value={activeUsersToday.toLocaleString()} />
    </div>
  );
}
