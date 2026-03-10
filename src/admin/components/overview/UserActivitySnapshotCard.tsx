"use client";

import SummaryCard from "../shared/SummaryCard";

interface UserActivitySnapshotCardProps {
  totalUsers: number;
  activeToday: number;
  activeMonth: number;
  newSignups: number;
  uploadsToday: number;
}

export default function UserActivitySnapshotCard({
  totalUsers,
  activeToday,
  activeMonth,
  newSignups,
  uploadsToday,
}: UserActivitySnapshotCardProps) {
  return (
    <SummaryCard
      label="User Activity"
      value={`${activeToday.toLocaleString()} active today`}
      subtitle={`${totalUsers.toLocaleString()} total · ${activeMonth} this month · +${newSignups} new · ${uploadsToday.toLocaleString()} uploads`}
    />
  );
}
