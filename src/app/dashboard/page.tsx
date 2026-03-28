import { Suspense } from "react";
import TopBar from "@/components/dashboard/TopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

export default function DashboardPage() {
  return (
    <>
      <TopBar title="Home" showLayoutSettings />
      <main className="flex-1 overflow-auto px-3 py-4 pb-28 sm:p-6 sm:pb-6">
        <Suspense fallback={null}>
          <HomeStorageView basePath="/dashboard" />
        </Suspense>
      </main>
    </>
  );
}
