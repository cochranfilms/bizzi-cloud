"use client";

import dynamic from "next/dynamic";
import TopBar from "@/components/dashboard/TopBar";

const StorageAnalyticsPage = dynamic(
  () => import("@/components/dashboard/storage/StorageAnalyticsPage"),
  { ssr: false }
);

export default function EnterpriseStoragePage() {
  return (
    <>
      <TopBar title="Storage" />
      <main className="flex-1 overflow-auto p-6">
        <StorageAnalyticsPage basePath="/enterprise" />
      </main>
    </>
  );
}
