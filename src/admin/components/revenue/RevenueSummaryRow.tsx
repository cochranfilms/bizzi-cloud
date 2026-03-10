"use client";

import { DollarSign, Users, TrendingUp } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";
import { formatCurrency } from "@/admin/utils/formatCurrency";
import { formatPercentage } from "@/admin/utils/formatPercentage";

interface RevenueSummaryRowProps {
  mrr: number;
  arr: number;
  payingUsers: number;
  conversionRate: number;
  arpu: number;
}

export default function RevenueSummaryRow({
  mrr,
  arr,
  payingUsers,
  conversionRate,
  arpu,
}: RevenueSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryCard label="MRR" value={formatCurrency(mrr)} icon={DollarSign} />
      <SummaryCard label="ARR" value={formatCurrency(arr)} />
      <SummaryCard label="Paying users" value={payingUsers.toLocaleString()} icon={Users} />
      <SummaryCard label="Conversion" value={formatPercentage(conversionRate)} icon={TrendingUp} />
      <SummaryCard label="ARPU" value={formatCurrency(arpu)} />
    </div>
  );
}
