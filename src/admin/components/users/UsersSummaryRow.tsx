"use client";

import { Users, UserPlus, UserCheck } from "lucide-react";
import SummaryCard from "../shared/SummaryCard";

interface UsersSummaryRowProps {
  total: number;
  active?: number;
  newThisMonth?: number;
}

export default function UsersSummaryRow({
  total,
  active,
  newThisMonth,
}: UsersSummaryRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryCard label="Total users" value={total.toLocaleString()} icon={Users} />
      {active != null && (
        <SummaryCard label="Active" value={active.toLocaleString()} icon={UserCheck} />
      )}
      {newThisMonth != null && (
        <SummaryCard label="New this month" value={newThisMonth.toLocaleString()} icon={UserPlus} />
      )}
    </div>
  );
}
