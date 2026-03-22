"use client";

import TopBar from "@/components/dashboard/TopBar";
import DashboardContent from "@/components/dashboard/DashboardContent";
import { WorkspaceSelector } from "@/components/dashboard/WorkspaceSelector";
import { useSearchParams } from "next/navigation";

export default function EnterpriseFilesPage() {
  const searchParams = useSearchParams();
  const driveId = searchParams.get("drive") ?? searchParams.get("drive_id") ?? null;

  return (
    <>
      <TopBar title="All files" showLayoutSettings />
      <div className="border-b border-neutral-200 bg-neutral-50/50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900/50">
        <WorkspaceSelector driveId={driveId} />
      </div>
      <main className="flex-1 overflow-auto p-6">
        <DashboardContent />
      </main>
    </>
  );
}
