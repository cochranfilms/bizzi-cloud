"use client";

import TopBar from "@/components/dashboard/TopBar";
import RecentContent from "@/components/dashboard/RecentContent";

export default function TeamRecentPage() {
  return (
    <>
      <TopBar title="Recent" />
      <main className="flex-1 overflow-auto p-6">
        <RecentContent />
      </main>
    </>
  );
}
