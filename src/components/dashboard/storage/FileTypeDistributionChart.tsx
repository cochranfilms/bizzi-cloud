"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { STORAGE_CATEGORY_HEX } from "@/lib/analytics/storage-colors";
import type { CategoryAggregate } from "@/lib/analytics/aggregate";

interface ChartDataPoint {
  id: string;
  name: string;
  value: number;
  percent: number;
  count: number;
}

interface FileTypeDistributionChartProps {
  categories: CategoryAggregate[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload as ChartDataPoint;
  if (!item) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
      <div className="font-semibold text-neutral-900 dark:text-white">
        {item.name}
      </div>
      <div className="mt-1 space-y-0.5 text-neutral-600 dark:text-neutral-300">
        <span>{formatBytes(item.value)}</span>
        <span className="mx-1.5">·</span>
        <span>{item.percent.toFixed(1)}%</span>
        <span className="mx-1.5">·</span>
        <span>{item.count.toLocaleString()} file{item.count !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

export default function FileTypeDistributionChart({
  categories,
}: FileTypeDistributionChartProps) {
  const totalBytes = categories.reduce((sum, c) => sum + c.bytes, 0);
  const data: ChartDataPoint[] = categories
    .filter((c) => c.bytes > 0)
    .map((c) => ({
      id: c.id,
      name: c.label,
      value: c.bytes,
      percent: totalBytes > 0 ? (c.bytes / totalBytes) * 100 : 0,
      count: c.count,
    }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No files to display
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-w-0 w-full rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900"
      role="img"
      aria-label={`Storage by type: ${data.map((d) => `${d.name} ${formatBytes(d.value)}`).join(", ")}`}
    >
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
        Storage by type
      </h4>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="mx-auto aspect-square h-44 w-44 min-h-[176px] min-w-[176px] shrink-0 sm:h-48 sm:w-48 sm:min-h-[192px] sm:min-w-[192px]">
          <ResponsiveContainer width="100%" height="100%" minHeight={176} minWidth={176}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="52%"
                outerRadius="85%"
                paddingAngle={3}
                dataKey="value"
                minAngle={2}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.5}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STORAGE_CATEGORY_HEX[entry.id] ?? "#9ca3af"}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-1">
          {data.map((entry) => (
            <div
              key={entry.id}
              className="flex min-w-0 items-center justify-between gap-2 text-sm"
            >
              <div className="flex min-w-0 shrink items-center gap-2">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: STORAGE_CATEGORY_HEX[entry.id] ?? "#9ca3af" }}
                  aria-hidden
                />
                <span className="min-w-0 break-words font-medium text-neutral-800 dark:text-neutral-200">
                  {entry.name}
                </span>
              </div>
              <span className="shrink-0 tabular-nums text-neutral-600 dark:text-neutral-400">
                {formatBytes(entry.value)}
                <span className="ml-1 text-neutral-500 dark:text-neutral-500">
                  ({entry.percent.toFixed(1)}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
