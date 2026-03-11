"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { STORAGE_CATEGORY_HEX } from "@/lib/analytics/storage-colors";
import type { CategoryAggregate } from "@/lib/analytics/aggregate";

interface SegmentedStorageBarProps {
  categories: CategoryAggregate[];
  totalUsedBytes: number;
  totalQuotaBytes: number | null;
}

export default function SegmentedStorageBar({
  categories,
  totalUsedBytes,
  totalQuotaBytes,
}: SegmentedStorageBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const displayTotal =
    totalQuotaBytes != null && totalQuotaBytes > totalUsedBytes
      ? totalQuotaBytes
      : totalUsedBytes;

  const remainingBytes =
    totalQuotaBytes != null ? Math.max(0, totalQuotaBytes - totalUsedBytes) : 0;

  const segments = categories
    .filter((c) => c.bytes > 0)
    .map((cat) => ({
      ...cat,
      widthPercent:
        displayTotal > 0 ? (cat.bytes / displayTotal) * 100 : 0,
    }));

  const remainingPercent =
    displayTotal > 0 ? (remainingBytes / displayTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex h-8 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="shrink-0 min-w-[2px] cursor-pointer transition-all duration-300 ease-out"
            style={{
              width: `${Math.max(seg.widthPercent, 0.5)}%`,
              backgroundColor: STORAGE_CATEGORY_HEX[seg.id] ?? "#9ca3af",
            }}
            onMouseEnter={() => setHoveredId(seg.id)}
            onMouseLeave={() => setHoveredId(null)}
            title={`${seg.label}: ${formatBytes(seg.bytes)} (${seg.percent.toFixed(1)}%)`}
          />
        ))}
        {remainingPercent > 0 && (
          <div
            className="shrink-0 bg-neutral-200 dark:bg-neutral-700"
            style={{ width: `${remainingPercent}%` }}
            aria-label="Remaining space"
          />
        )}
      </div>
      {hoveredId && (
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-md dark:border-neutral-700 dark:bg-neutral-900">
          {(() => {
            const cat = categories.find((c) => c.id === hoveredId);
            if (!cat) return null;
            return (
              <>
                <span className="font-medium">{cat.label}</span>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {" "}
                  · {formatBytes(cat.bytes)} · {cat.percent.toFixed(1)}% ·{" "}
                  {cat.count.toLocaleString()} files
                </span>
              </>
            );
          })()}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="flex items-center gap-2 text-sm"
          >
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: STORAGE_CATEGORY_HEX[seg.id] ?? "#9ca3af" }}
              aria-hidden
            />
            <span className="text-neutral-700 dark:text-neutral-300">
              {seg.label}
            </span>
          </div>
        ))}
        {remainingPercent > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3 w-3 rounded-full bg-neutral-200 dark:bg-neutral-700"
              aria-hidden
            />
            <span className="text-neutral-500 dark:text-neutral-400">
              Remaining
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
