import { Suspense } from "react";
import TopBar from "@/components/dashboard/TopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";
import EnterpriseHomeControlCenter from "@/components/enterprise/EnterpriseHomeControlCenter";

export default function EnterpriseHomePage() {
  return (
    <>
      <TopBar title="Home" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <EnterpriseHomeControlCenter />
        <Suspense fallback={null}>
          <HomeStorageView basePath="/enterprise" />
        </Suspense>
      </main>
    </>
  );
}
