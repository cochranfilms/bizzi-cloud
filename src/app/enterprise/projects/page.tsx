import TopBar from "@/components/dashboard/TopBar";
import ProjectsView from "@/components/dashboard/ProjectsView";

export default function EnterpriseProjectsPage() {
  return (
    <>
      <TopBar title="Projects" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Project files and libraries for your organization workspaces only (same visibility as All files).
        </p>
        <ProjectsView basePath="/enterprise" />
      </main>
    </>
  );
}
