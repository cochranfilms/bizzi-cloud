"use client";

import TopBar from "@/components/dashboard/TopBar";
import ProjectsView from "@/components/dashboard/ProjectsView";
import { useParams } from "next/navigation";

export default function TeamProjectsPage() {
  const params = useParams();
  const ownerId = typeof params?.ownerId === "string" ? params.ownerId : "";
  const basePath = ownerId ? `/team/${ownerId}` : "/team";

  return (
    <>
      <TopBar title="Projects" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Creative projects for this team workspace only.
        </p>
        <ProjectsView basePath={basePath} />
      </main>
    </>
  );
}
