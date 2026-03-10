"use client";

import { MessageSquare, AlertCircle } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";

interface SupportSummaryRowProps {
  total: number;
  open: number;
  urgent: number;
}

export default function SupportSummaryRow({
  total,
  open,
  urgent,
}: SupportSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <SummaryCard label="Open tickets" value={total} icon={MessageSquare} />
      <SummaryCard label="In progress" value={open} />
      {urgent > 0 && (
        <SummaryCard
          label="Urgent"
          value={urgent}
          status="critical"
          icon={AlertCircle}
        />
      )}
    </div>
  );
}
