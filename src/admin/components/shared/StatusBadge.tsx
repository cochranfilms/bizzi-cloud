"use client";

import { mapSeverityToBadge, type Severity } from "@/admin/utils/mapSeverityToBadge";

interface StatusBadgeProps {
  status: Severity | string;
  severity?: Severity;
  label?: string;
}

export default function StatusBadge({ status, severity, label }: StatusBadgeProps) {
  const s = (severity ?? status) as Severity;
  const badge = mapSeverityToBadge(s);
  const displayLabel = label ?? (typeof status === "string" ? status : s);

  return (
    <span className={`inline-flex items-center gap-1.5 ${badge.className}`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${badge.dotClassName}`}
      />
      {displayLabel}
    </span>
  );
}
