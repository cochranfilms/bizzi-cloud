"use client";

import { Activity, DollarSign, HardDrive, Users } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";
import { formatBytes } from "@/admin/utils/formatBytes";
import { formatCurrency } from "@/admin/utils/formatCurrency";

interface ExecutiveSummaryGridProps {
  platformHealth: "healthy" | "warning" | "critical";
  revenue: number;
  revenueDelta?: { value: number; label: string; isPositive?: boolean; isNegative?: boolean };
  storageUsedBytes: number;
  storagePercent?: number;
  activeUsersToday: number;
  activeUsersDelta?: { value: number; label: string; isPositive?: boolean; isNegative?: boolean };
}

export default function ExecutiveSummaryGrid({
  platformHealth,
  revenue,
  revenueDelta,
  storageUsedBytes,
  storagePercent,
  activeUsersToday,
  activeUsersDelta,
}: ExecutiveSummaryGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="Platform Health"
        value={platformHealth.charAt(0).toUpperCase() + platformHealth.slice(1)}
        status={platformHealth === "critical" ? "critical" : platformHealth === "warning" ? "warning" : "healthy"}
      />
      <SummaryCard
        label="MRR"
        value={formatCurrency(revenue)}
        delta={revenueDelta}
        trend={revenueDelta?.isPositive ? "up" : revenueDelta?.isNegative ? "down" : "neutral"}
      />
      <SummaryCard
        label="Storage Cost"
        value={formatBytes(storageUsedBytes)}
        subtitle={storagePercent != null ? `${storagePercent.toFixed(1)}% used` : undefined}
      />
      <SummaryCard
        label="Active Users Today"
        value={activeUsersToday.toLocaleString()}
        delta={activeUsersDelta}
        trend={activeUsersDelta?.isPositive ? "up" : activeUsersDelta?.isNegative ? "down" : "neutral"}
      />
    </div>
  );
}
