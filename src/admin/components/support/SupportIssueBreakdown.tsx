"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#00BFFF", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#64748b"];

interface SupportIssueBreakdownProps {
  breakdown: Record<string, number>;
}

export default function SupportIssueBreakdown({ breakdown }: SupportIssueBreakdownProps) {
  const data = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">No issue data</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Issues by type
      </h4>
      <div className="h-48 min-h-[12rem] w-full min-w-[200px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={176} minWidth={176}>
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
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => [Number(v ?? 0), ""]} />
            <Legend formatter={(value) => value} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
