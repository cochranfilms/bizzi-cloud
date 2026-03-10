"use client";

import { Bell, AlertTriangle } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";

interface AlertsSummaryRowProps {
  total: number;
  critical: number;
  warning: number;
}

export default function AlertsSummaryRow({
  total,
  critical,
  warning,
}: AlertsSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <SummaryCard label="Active alerts" value={total} icon={Bell} />
      <SummaryCard
        label="Critical"
        value={critical}
        status={critical > 0 ? "critical" : undefined}
      />
      <SummaryCard
        label="Warning"
        value={warning}
        status={warning > 0 && critical === 0 ? "warning" : undefined}
      />
    </div>
  );
}
