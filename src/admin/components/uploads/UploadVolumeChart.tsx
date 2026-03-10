"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { UploadVolumePoint } from "@/admin/types/adminUploads.types";

interface UploadVolumeChartProps {
  data: UploadVolumePoint[];
}

export default function UploadVolumeChart({ data }: UploadVolumeChartProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Upload volume (14 days)
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v) => Number(v).toLocaleString()}
              labelFormatter={(v) => new Date(v).toLocaleDateString()}
            />
            <Legend />
            <Bar dataKey="successCount" name="Success" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="failedCount" name="Failed" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
