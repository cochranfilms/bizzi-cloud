import TopBar from "@/components/dashboard/TopBar";
import DashboardContent from "@/components/dashboard/DashboardContent";

export default function FilesPage() {
  return (
    <>
      <TopBar title="All files" />
      <main className="flex-1 overflow-auto p-6">
        <DashboardContent />
      </main>
    </>
  );
}
