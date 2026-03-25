"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBytes } from "@/lib/analytics/format-bytes";

interface MonthlyUpload {
  month: string;
  bytes: number;
}

interface StorageGrowthChartProps {
  monthlyUploads?: MonthlyUpload[];
}

export default function StorageGrowthChart({
  monthlyUploads = [],
}: StorageGrowthChartProps) {
  const data = monthlyUploads.map((m) => ({
    ...m,
    display: formatBytes(m.bytes),
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No upload history yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-48 w-full min-h-[12rem] min-w-0 flex-col rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Monthly upload volume
      </h4>
      <div className="relative min-h-[120px] w-full min-w-[200px] flex-1">
      <ResponsiveContainer width="100%" height="100%" minHeight={120} minWidth={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00BFFF" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#00BFFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => {
              const [y, m] = v.split("-");
              return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m, 10) - 1]} ${y.slice(2)}`;
            }}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => formatBytes(v)}
            width={50}
          />
          <Tooltip
            formatter={(value) => [
              formatBytes(typeof value === "number" ? value : 0),
              "Uploaded",
            ]}
            labelFormatter={(label) => {
              const [y, m] = String(label).split("-");
              return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m, 10) - 1]} 20${y}`;
            }}
          />
          <Area
            type="monotone"
            dataKey="bytes"
            stroke="#00BFFF"
            strokeWidth={2}
            fill="url(#uploadGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
