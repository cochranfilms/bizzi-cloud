"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ChevronLeft, FolderOpen } from "lucide-react";
import TopBar from "@/components/dashboard/TopBar";
import SharedFolderContent from "@/components/share/SharedFolderContent";

export default function SharedFolderPage() {
  const params = useParams();
  const pathname = usePathname();
  const token = params?.token as string | undefined;
  const [folderName, setFolderName] = useState<string>("Shared folder");

  // Derive base path for back link (dashboard, enterprise, or desktop)
  const basePath = pathname?.startsWith("/enterprise")
    ? "/enterprise"
    : pathname?.startsWith("/desktop")
      ? "/desktop/app"
      : "/dashboard";

  if (!token) {
    return (
      <>
        <TopBar title="Share not found" />
        <main className="flex-1 overflow-auto p-6">
          <div className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
            <h2 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
              Invalid share link
            </h2>
            <Link
              href={`${basePath}/shared`}
              className="flex items-center gap-2 text-sm text-bizzi-blue hover:underline dark:text-bizzi-cyan"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Shared
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title={folderName} />
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-4">
          <Link
            href={`${basePath}/shared`}
            className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Shared
          </Link>
        </div>
        <SharedFolderContent token={token} embedded onFolderNameLoaded={setFolderName} />
      </main>
    </>
  );
}
