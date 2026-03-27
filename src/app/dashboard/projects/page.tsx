import TopBar from "@/components/dashboard/TopBar";
import ProjectsView from "@/components/dashboard/ProjectsView";

export default function ProjectsPage() {
  return (
    <>
      <TopBar title="Projects" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Creative project files and libraries in your personal workspace (Premiere, Final Cut, Resolve,
          After Effects, Lightroom, and interchange formats). Scoped the same way as All files — nothing
          crosses into other workspaces.
        </p>
        <ProjectsView basePath="/dashboard" />
      </main>
    </>
  );
}
