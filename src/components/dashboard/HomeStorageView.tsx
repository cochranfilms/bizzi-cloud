"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { usePinned, fetchPinnedFiles } from "@/hooks/usePinned";
import FolderCard, { type FolderItem } from "./FolderCard";
import FileCard from "./FileCard";
import FilePreviewModal from "./FilePreviewModal";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useCurrentFolder } from "@/context/CurrentFolderContext";

interface HomeStorageViewProps {
  /** Base path for links: "/dashboard" or "/enterprise" */
  basePath?: string;
}

export default function HomeStorageView({ basePath = "/dashboard" }: HomeStorageViewProps) {
  const { driveFolders, loading, deleteFile, deleteFolder, refetch } = useCloudFiles();
  const { pinnedFolderIds, pinnedFileIds, loading: pinnedLoading, refetch: refetchPinned } = usePinned();
  const { setCurrentDrive: setCurrentFolderDriveId } = useCurrentFolder();
  const [pinnedFiles, setPinnedFiles] = useState<RecentFile[]>([]);
  const [pinnedFilesLoading, setPinnedFilesLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);

  const filesHref = `${basePath}/files`;
  const totalItems = driveFolders.reduce((sum, d) => sum + d.items, 0);

  const folderItems: FolderItem[] = driveFolders.map((d) => ({
    name: d.name,
    type: "folder" as const,
    key: d.key,
    items: d.items,
    hideShare: false,
    driveId: d.id,
  }));

  const pinnedFolderItems = folderItems.filter((f) => f.driveId && pinnedFolderIds.has(f.driveId));

  const loadPinnedFiles = useCallback(async () => {
    const ids = Array.from(pinnedFileIds);
    if (ids.length === 0) {
      setPinnedFiles([]);
      return;
    }
    setPinnedFilesLoading(true);
    try {
      const files = await fetchPinnedFiles(ids);
      setPinnedFiles(files);
    } catch {
      setPinnedFiles([]);
    } finally {
      setPinnedFilesLoading(false);
    }
  }, [pinnedFileIds]);

  useEffect(() => {
    loadPinnedFiles();
  }, [loadPinnedFiles]);

  const openDrive = useCallback(
    (driveId: string, name: string) => {
      setCurrentFolderDriveId(driveId);
      if (typeof window !== "undefined") {
        window.location.href = `${filesHref}?drive=${driveId}`;
      }
    },
    [filesHref, setCurrentFolderDriveId]
  );

  const hasPinned = pinnedFolderItems.length > 0 || pinnedFileIds.size > 0;
  const isLoading = loading || pinnedLoading;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Section 1: Pinned */}
      {(hasPinned || isLoading) && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Pinned
          </h2>
          {isLoading || pinnedFilesLoading ? (
            <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Loading…
            </div>
          ) : hasPinned ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {pinnedFolderItems.map((item) => (
                <FolderCard
                  key={item.key}
                  item={item}
                  onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                />
              ))}
              {pinnedFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  onClick={() => setPreviewFile(file)}
                  onDelete={async () => {
                    await deleteFile(file.id);
                    await refetch();
                    await refetchPinned();
                    loadPinnedFiles();
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
              Pin files or folders from the All Files tab for quick access.
            </p>
          )}
        </section>
      )}

      {/* Section 2: All Folders */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          All Folders
        </h2>
        {loading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading…
          </div>
        ) : folderItems.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {folderItems.map((item) => (
              <FolderCard
                key={item.key}
                item={item}
                onClick={() => item.driveId && openDrive(item.driveId, item.name)}
              />
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
            No folders yet. Sync a drive from the Backup section to get started.
          </p>
        )}
      </section>

      {/* Section 3: Storage */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Storage
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <Link
            href={filesHref}
            className="group flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 transition-colors hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
          >
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
              <Cloud className="h-8 w-8" />
            </div>
            <h3 className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white">
              Storage
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {totalItems} {totalItems === 1 ? "item" : "items"}
            </p>
          </Link>
        </div>
      </section>

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
