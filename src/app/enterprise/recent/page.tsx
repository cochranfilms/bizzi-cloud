import TopBar from "@/components/dashboard/TopBar";
import RecentContent from "@/components/dashboard/RecentContent";

export default function EnterpriseRecentPage() {
  return (
    <>
      <TopBar title="Recent" />
      <main className="flex-1 overflow-auto p-6">
        <RecentContent basePath="/enterprise" />
      </main>
    </>
  );
}
