"use client";

import { formatBytes } from "@/admin/utils/formatBytes";
import SummaryCard from "../shared/SummaryCard";

interface StorageSnapshotCardProps {
  totalUsedBytes: number;
  totalAvailableBytes: number | null;
  avgPerUserBytes: number;
}

export default function StorageSnapshotCard({
  totalUsedBytes,
  totalAvailableBytes,
  avgPerUserBytes,
}: StorageSnapshotCardProps) {
  const percent =
    totalAvailableBytes && totalAvailableBytes > 0
      ? (totalUsedBytes / (totalUsedBytes + totalAvailableBytes)) * 100
      : null;

  return (
    <SummaryCard
      label="Storage"
      value={formatBytes(totalUsedBytes)}
      subtitle={
        totalAvailableBytes != null
          ? `${formatBytes(totalAvailableBytes)} available · ${formatBytes(avgPerUserBytes)} avg/user`
          : `${formatBytes(avgPerUserBytes)} avg/user`
      }
    />
  );
}
