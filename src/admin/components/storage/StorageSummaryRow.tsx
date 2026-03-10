"use client";

import { HardDrive, TrendingUp } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";
import { formatBytes } from "@/admin/utils/formatBytes";

interface StorageSummaryRowProps {
  totalBytes: number;
  quotaBytes?: number | null;
  categoriesCount?: number;
}

export default function StorageSummaryRow({
  totalBytes,
  quotaBytes,
  categoriesCount = 0,
}: StorageSummaryRowProps) {
  const percent =
    quotaBytes && quotaBytes > 0 ? (totalBytes / quotaBytes) * 100 : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryCard
        label="Total storage used"
        value={formatBytes(totalBytes)}
        icon={HardDrive}
      />
      {quotaBytes != null && (
        <SummaryCard
          label="Capacity"
          value={formatBytes(quotaBytes)}
          subtitle={percent != null ? `${percent.toFixed(1)}% used` : undefined}
        />
      )}
      {categoriesCount > 0 && (
        <SummaryCard
          label="Categories"
          value={categoriesCount}
          icon={TrendingUp}
        />
      )}
    </div>
  );
}
