"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { STORAGE_CATEGORY_HEX } from "@/lib/analytics/storage-colors";
import type { CategoryAggregate } from "@/lib/analytics/aggregate";

interface FileTypeDistributionChartProps {
  categories: CategoryAggregate[];
}

export default function FileTypeDistributionChart({
  categories,
}: FileTypeDistributionChartProps) {
  const data = categories
    .filter((c) => c.bytes > 0)
    .map((c) => ({
      id: c.id,
      name: c.label,
      value: c.bytes,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No files to display
        </p>
      </div>
    );
  }

  return (
    <div className="h-48 w-full rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Storage by type
      </h4>
      <ResponsiveContainer width="100%" height="80%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={60}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={STORAGE_CATEGORY_HEX[entry.id] ?? "#9ca3af"}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatBytes(typeof value === "number" ? value : 0)}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
            }}
          />
          <Legend
            formatter={(value) => {
              const item = data.find((d) => d.name === value);
              return `${value}${item ? ` (${formatBytes(item.value)})` : ""}`;
            }}
            wrapperStyle={{ fontSize: "10px" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
