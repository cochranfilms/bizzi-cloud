"use client";

import { useAdminFormatCurrency } from "@/context/AdminDisplayContext";
import SummaryCard from "../shared/SummaryCard";

interface RevenueSnapshotCardProps {
  mrr: number;
  grossMarginPercent?: number | null;
  infraCost?: number | null;
}

export default function RevenueSnapshotCard({
  mrr,
  grossMarginPercent,
  infraCost,
}: RevenueSnapshotCardProps) {
  const formatCurrency = useAdminFormatCurrency();
  const subtitle =
    grossMarginPercent != null && infraCost != null
      ? `${grossMarginPercent}% margin · ${formatCurrency(infraCost)} infra cost`
      : "Connect billing API for cost data";
  return (
    <SummaryCard label="Revenue Snapshot" value={formatCurrency(mrr)} subtitle={subtitle} />
  );
}
