"use client";

import { useAdminFormatCurrency } from "@/context/AdminDisplayContext";
import SummaryCard from "../shared/SummaryCard";

interface RevenueSnapshotCardProps {
  mrr: number;
  grossMarginPercent: number;
  infraCost: number;
}

export default function RevenueSnapshotCard({
  mrr,
  grossMarginPercent,
  infraCost,
}: RevenueSnapshotCardProps) {
  const formatCurrency = useAdminFormatCurrency();
  return (
    <SummaryCard
      label="Revenue Snapshot"
      value={formatCurrency(mrr)}
      subtitle={`${grossMarginPercent}% margin · ${formatCurrency(infraCost)} infra cost`}
    />
  );
}
