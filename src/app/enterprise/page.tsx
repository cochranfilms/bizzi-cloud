import { Suspense } from "react";
import DashboardHomeTopBar from "@/components/dashboard/DashboardHomeTopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

export default function EnterpriseHomePage() {
  return (
    <>
      <DashboardHomeTopBar />
      <main className="flex-1 overflow-auto px-4 pt-2 pb-28 sm:px-6 sm:pt-3 sm:pb-6 xl:px-8">
        <Suspense fallback={null}>
          <HomeStorageView basePath="/enterprise" />
        </Suspense>
      </main>
    </>
  );
}
