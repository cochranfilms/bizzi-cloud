import TopBar from "@/components/dashboard/TopBar";
import RecentContent from "@/components/dashboard/RecentContent";

export default function DesktopRecentPage() {
  return (
    <>
      <TopBar title="Recent" />
      <main className="flex-1 overflow-auto p-6">
        <RecentContent basePath="/desktop/app" />
      </main>
    </>
  );
}
