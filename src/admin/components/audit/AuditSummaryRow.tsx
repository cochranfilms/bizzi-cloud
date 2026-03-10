"use client";

import { ScrollText } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";

interface AuditSummaryRowProps {
  total: number;
}

export default function AuditSummaryRow({ total }: AuditSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-1">
      <SummaryCard label="Log entries" value={total.toLocaleString()} icon={ScrollText} />
    </div>
  );
}
