import TopBar from "@/components/dashboard/TopBar";
import DashboardContent from "@/components/dashboard/DashboardContent";

export default function DesktopFilesPage() {
  return (
    <>
      <TopBar title="All files" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <DashboardContent />
      </main>
    </>
  );
}
