"use client";

import SummaryCard from "../shared/SummaryCard";

interface UserActivitySnapshotCardProps {
  totalUsers: number;
  activeToday: number;
  activeMonth: number;
  newSignups?: number | null;
  uploadsToday: number;
}

export default function UserActivitySnapshotCard({
  totalUsers,
  activeToday,
  activeMonth,
  newSignups,
  uploadsToday,
}: UserActivitySnapshotCardProps) {
  const newPart = newSignups != null ? ` · +${newSignups} new` : "";
  return (
    <SummaryCard
      label="User Activity"
      value={`${activeToday.toLocaleString()} active today`}
      subtitle={`${totalUsers.toLocaleString()} total · ${activeMonth} this month${newPart} · ${uploadsToday.toLocaleString()} uploads`}
    />
  );
}
