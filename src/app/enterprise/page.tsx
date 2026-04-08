import { Suspense } from "react";
import DashboardHomeTopBar from "@/components/dashboard/DashboardHomeTopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

export default function EnterpriseHomePage() {
  return (
    <>
      <DashboardHomeTopBar />
      <main className="flex-1 overflow-auto px-4 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-6 xl:px-8">
        <Suspense fallback={null}>
          <HomeStorageView basePath="/enterprise" />
        </Suspense>
      </main>
    </>
  );
}
