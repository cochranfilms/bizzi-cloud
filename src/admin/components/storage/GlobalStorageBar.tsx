"use client";

import { formatBytes } from "@/admin/utils/formatBytes";

interface GlobalStorageBarProps {
  usedBytes: number;
  totalBytes: number;
}

export default function GlobalStorageBar({
  usedBytes,
  totalBytes,
}: GlobalStorageBarProps) {
  const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const barColor =
    percent > 90 ? "bg-red-500" : percent > 75 ? "bg-amber-500" : "bg-bizzi-blue";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">
          Platform storage
        </span>
        <span className="font-medium">
          {formatBytes(usedBytes)} / {formatBytes(totalBytes)} ({percent.toFixed(1)}%)
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
