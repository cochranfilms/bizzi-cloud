"use client";

import { Suspense } from "react";
import DashboardHomeTopBar from "@/components/dashboard/DashboardHomeTopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";
import WorkspaceMainWithContextMenu from "@/components/dashboard/WorkspaceMainWithContextMenu";

export default function DesktopAppPage() {
  return (
    <>
      <DashboardHomeTopBar />
      <WorkspaceMainWithContextMenu className="min-h-0 flex-1 overflow-auto px-6 pt-3 pb-6">
        <Suspense fallback={null}>
          <HomeStorageView basePath="/desktop/app" />
        </Suspense>
      </WorkspaceMainWithContextMenu>
    </>
  );
}
