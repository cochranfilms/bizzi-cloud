"use client";

import { Suspense } from "react";
import TopBar from "@/components/dashboard/TopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

export default function DesktopAppPage() {
  return (
    <>
      <TopBar title="Home" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <Suspense fallback={null}>
          <HomeStorageView basePath="/desktop/app" />
        </Suspense>
      </main>
    </>
  );
}
