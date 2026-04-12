"use client";

import { Suspense } from "react";
import DashboardHomeTopBar from "@/components/dashboard/DashboardHomeTopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

export default function DesktopAppPage() {
  return (
    <>
      <DashboardHomeTopBar />
      <main className="flex-1 overflow-auto px-6 pt-3 pb-6">
        <Suspense fallback={null}>
          <HomeStorageView basePath="/desktop/app" />
        </Suspense>
      </main>
    </>
  );
}
