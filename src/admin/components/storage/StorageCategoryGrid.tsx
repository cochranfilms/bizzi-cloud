"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatBytes } from "@/admin/utils/formatBytes";
import { STORAGE_CATEGORY_HEX } from "@/lib/analytics/storage-colors";
import type { StorageCategory } from "@/admin/types/adminStorage.types";

interface StorageCategoryGridProps {
  categories: StorageCategory[];
}

export default function StorageCategoryGrid({ categories }: StorageCategoryGridProps) {
  const data = categories
    .filter((c) => c.bytes > 0)
    .map((c) => ({
      name: c.label,
      value: c.bytes,
      id: c.id,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">No storage data</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Storage by category
      </h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.id}
                  fill={STORAGE_CATEGORY_HEX[entry.id] ?? "#9ca3af"}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatBytes(Number(v ?? 0))}
              contentStyle={{ borderRadius: "8px" }}
            />
            <Legend formatter={(value, entry) => {
              const p = entry?.payload as { name?: string; value?: number } | undefined;
              return p ? `${p.name ?? value} (${formatBytes(p.value ?? 0)})` : String(value);
            }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
