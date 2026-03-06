import TopBar from "@/components/dashboard/TopBar";

export default function ProjectsPage() {
  return (
    <>
      <TopBar title="Projects" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-neutral-500 dark:text-neutral-400">
          Organize files by project.
        </p>
      </main>
    </>
  );
}
