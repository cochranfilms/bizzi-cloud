"use client";

import TopBar from "@/components/dashboard/TopBar";
import HeartsContent from "@/components/dashboard/HeartsContent";

export default function TeamHeartsPage() {
  return (
    <>
      <TopBar title="Hearts" />
      <main className="flex-1 overflow-auto p-6">
        <HeartsContent />
      </main>
    </>
  );
}
