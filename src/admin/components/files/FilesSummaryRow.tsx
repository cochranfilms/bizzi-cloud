"use client";

import { FileStack, AlertTriangle } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";

interface FilesSummaryRowProps {
  total: number;
  flagged?: number;
}

export default function FilesSummaryRow({ total, flagged = 0 }: FilesSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SummaryCard label="Total files" value={total.toLocaleString()} icon={FileStack} />
      {flagged > 0 && (
        <SummaryCard
          label="Flagged for review"
          value={flagged}
          status="warning"
          icon={AlertTriangle}
        />
      )}
    </div>
  );
}
