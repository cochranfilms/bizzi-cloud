"use client";

import TopBar from "@/components/dashboard/TopBar";
import DashboardContent from "@/components/dashboard/DashboardContent";
import { EnterpriseLocationSelector } from "@/components/dashboard/EnterpriseLocationSelector";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useSearchParams } from "next/navigation";

export default function EnterpriseFilesPage() {
  const searchParams = useSearchParams();
  const driveId = searchParams.get("drive") ?? searchParams.get("drive_id") ?? null;
  const { selectedWorkspaceId, setSelectedWorkspaceId } = useCurrentFolder();

  return (
    <>
      <TopBar title="All files" showLayoutSettings />
      <div className="border-b border-neutral-200 bg-neutral-50/50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900/50">
        {driveId ? (
          <EnterpriseLocationSelector
            driveId={driveId}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={(id) => setSelectedWorkspaceId(id)}
          />
        ) : (
          <div className="flex items-center gap-2 py-1">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Organization Files — Choose a drive to get started
            </p>
          </div>
        )}
      </div>
      <main className="flex-1 overflow-auto p-6">
        <DashboardContent />
      </main>
    </>
  );
}
