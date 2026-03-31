"use client";

import { MessageSquare } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";

interface SupportSummaryRowProps {
  openCount: number;
  inProgressCount: number;
}

export default function SupportSummaryRow({
  openCount,
  inProgressCount,
}: SupportSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SummaryCard label="Open support tickets" value={openCount} icon={MessageSquare} />
      <SummaryCard
        label="Support tickets in progress"
        value={inProgressCount}
      />
    </div>
  );
}
