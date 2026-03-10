"use client";

import { Upload, CheckCircle, XCircle, Zap } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";
import { formatPercentage } from "@/admin/utils/formatPercentage";

interface UploadSummaryRowProps {
  countToday: number;
  successRate: number;
  avgSpeedMbps: number;
  failedCount: number;
}

export default function UploadSummaryRow({
  countToday,
  successRate,
  avgSpeedMbps,
  failedCount,
}: UploadSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="Uploads today"
        value={countToday.toLocaleString()}
        icon={Upload}
      />
      <SummaryCard
        label="Success rate"
        value={formatPercentage(successRate)}
        status={successRate >= 95 ? "healthy" : successRate >= 90 ? "warning" : "critical"}
        icon={CheckCircle}
      />
      <SummaryCard
        label="Avg speed"
        value={`${avgSpeedMbps} Mbps`}
        icon={Zap}
      />
      <SummaryCard
        label="Failed uploads"
        value={failedCount}
        status={failedCount > 100 ? "warning" : undefined}
        icon={XCircle}
      />
    </div>
  );
}
