"use client";

import { useEffect } from "react";
import TopBar from "@/components/dashboard/TopBar";
import DashboardContent from "@/components/dashboard/DashboardContent";
import { EnterpriseLocationSelector } from "@/components/dashboard/EnterpriseLocationSelector";
import { EnterpriseDrivePicker } from "@/components/dashboard/EnterpriseDrivePicker";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useSearchParams } from "next/navigation";

export default function EnterpriseFilesPage() {
  const searchParams = useSearchParams();
  const driveId = searchParams.get("drive") ?? searchParams.get("drive_id") ?? null;
  const workspaceFromUrl = searchParams.get("workspace") ?? searchParams.get("workspace_id") ?? null;
  const { selectedWorkspaceId, setSelectedWorkspaceId } = useCurrentFolder();

  useEffect(() => {
    if (driveId && workspaceFromUrl) {
      setSelectedWorkspaceId(workspaceFromUrl);
    }
  }, [driveId, workspaceFromUrl, setSelectedWorkspaceId]);

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
          <EnterpriseDrivePicker />
        )}
      </div>
      <main className="flex-1 overflow-auto p-6">
        <DashboardContent />
      </main>
    </>
  );
}
