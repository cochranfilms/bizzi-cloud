import TopBar from "@/components/dashboard/TopBar";
import DashboardContent from "@/components/dashboard/DashboardContent";
import FilesFilterTopChromeBoundary from "@/components/dashboard/FilesFilterTopChromeBoundary";

export default function DesktopFilesPage() {
  return (
    <FilesFilterTopChromeBoundary>
      <TopBar title="All files" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <DashboardContent />
      </main>
    </FilesFilterTopChromeBoundary>
  );
}
