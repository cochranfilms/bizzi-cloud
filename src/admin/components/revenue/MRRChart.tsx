"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RevenueDataPoint } from "@/admin/types/adminRevenue.types";
import { useAdminFormatCurrency } from "@/context/AdminDisplayContext";

interface MRRChartProps {
  data: RevenueDataPoint[];
}

export default function MRRChart({ data }: MRRChartProps) {
  const formatCurrency = useAdminFormatCurrency();
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        MRR trend
      </h3>
      <div className="h-64 min-h-[16rem] w-full min-w-[200px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={200} minWidth={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(v) => formatCurrency(Number(v ?? 0))}
              labelFormatter={(v) => new Date(v).toLocaleDateString()}
            />
            <Area
              type="monotone"
              dataKey="mrr"
              name="MRR"
              stroke="#10b981"
              fill="url(#mrrGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
