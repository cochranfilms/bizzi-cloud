import TopBar from "@/components/dashboard/TopBar";
import DashboardContent from "@/components/dashboard/DashboardContent";

export default function FilesPage() {
  return (
    <>
      <TopBar title="All files" showLayoutSettings />
      <main className="flex min-h-0 flex-1 flex-col p-6" data-files-main>
        <DashboardContent />
      </main>
    </>
  );
}
