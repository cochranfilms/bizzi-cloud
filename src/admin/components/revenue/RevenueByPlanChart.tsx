"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { RevenueByPlan } from "@/admin/types/adminRevenue.types";
import { useAdminFormatCurrency } from "@/context/AdminDisplayContext";

interface RevenueByPlanChartProps {
  data: RevenueByPlan[];
}

export default function RevenueByPlanChart({ data }: RevenueByPlanChartProps) {
  const formatCurrency = useAdminFormatCurrency();
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Revenue by plan
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
            <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="plan" width={55} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
            <Bar dataKey="mrr" name="MRR" fill="#00BFFF" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
