"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Film, LayoutGrid, List } from "lucide-react";
import type { FolderItem } from "./FolderCard";
import FolderCard from "./FolderCard";
import FileCard from "./FileCard";
import FilePreviewModal from "./FilePreviewModal";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { LOADING_COPY } from "@/lib/loading-copy";
import SectionTitle from "./SectionTitle";

const DRAG_THRESHOLD_PX = 5;

export default function CreatorContent() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [currentDrive, setCurrentDrive] = useState<{ id: string; name: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<RecentFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const {
    driveFolders,
    loading,
    fetchDriveFiles,
    deleteFile,
    deleteFolder,
    refetch,
  } = useCloudFiles({ creatorOnly: true });
  const {
    linkedDrives,
    storageVersion,
    creatorRawDriveId,
    getOrCreateCreatorRawDrive,
  } = useBackup();
  const { setCurrentDrive: setCurrentFolderDriveId } = useCurrentFolder();
  const { confirm } = useConfirm();

  const creatorDrives = linkedDrives.filter((d) => d.creator_section);

  const loadDriveFiles = useCallback(
    async (driveId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setDriveFilesLoading(true);
      try {
        const files = await fetchDriveFiles(driveId);
        setDriveFiles(files);
      } catch {
        setDriveFiles([]);
      } finally {
        setDriveFilesLoading(false);
      }
    },
    [fetchDriveFiles]
  );

  const openDrive = useCallback(
    (id: string, name: string) => {
      setCurrentFolderDriveId(id);
      setCurrentDrive({ id, name });
      loadDriveFiles(id);
    },
    [loadDriveFiles, setCurrentFolderDriveId]
  );

  const closeDrive = useCallback(() => {
    setCurrentFolderDriveId(null);
    setCurrentDrive(null);
    setDriveFiles([]);
  }, [setCurrentFolderDriveId]);

  // Ensure RAW drive exists on mount
  useEffect(() => {
    getOrCreateCreatorRawDrive().catch(console.error);
  }, [getOrCreateCreatorRawDrive]);

  // Refresh drive files when storage changes (e.g. after upload). Use silent to avoid loading flash.
  useEffect(() => {
    if (currentDrive && storageVersion > 0) {
      loadDriveFiles(currentDrive.id, { silent: true });
    }
  }, [storageVersion, currentDrive, loadDriveFiles]);

  const folderItems: FolderItem[] = driveFolders
    .map((d) => ({
      name: d.name,
      type: "folder" as const,
      key: d.key,
      items: d.items,
      hideShare: false,
      driveId: d.id,
      customIcon: d.isCreatorRaw ? Film : undefined,
      preventDelete: d.isCreatorRaw,
      preventRename: d.isCreatorRaw,
      preventMove: d.isCreatorRaw,
      isSystemFolder: d.isCreatorRaw,
    }))
    .sort((a, b) => {
      if (a.driveId === creatorRawDriveId) return -1;
      if (b.driveId === creatorRawDriveId) return 1;
      return 0;
    });

  return (
    <div className="w-full space-y-0">
      {currentDrive && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={closeDrive}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-neutral-400 dark:text-neutral-500">/</span>
          <span className="font-medium text-neutral-900 dark:text-white">{currentDrive.name}</span>
        </div>
      )}

      <section className="border-b border-neutral-200/60 py-6 last:border-b-0 dark:border-neutral-800/60">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <SectionTitle>
            {currentDrive ? "Files" : "Folders"}
          </SectionTitle>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded p-2 ${
                viewMode === "grid"
                  ? "bg-neutral-200 text-bizzi-blue dark:bg-neutral-700"
                  : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded p-2 ${
                viewMode === "list"
                  ? "bg-neutral-200 text-bizzi-blue dark:bg-neutral-700"
                  : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {currentDrive ? (
          driveFilesLoading ? (
            <div className="py-12">
              <LoadingSpinner label={LOADING_COPY.files} />
            </div>
          ) : driveFiles.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {driveFiles.map((file) => (
                <div key={file.id}>
                  <FileCard
                    file={file}
                    onClick={() => setPreviewFile(file)}
                    onDelete={async () => {
                      await deleteFile(file.id);
                      if (currentDrive) loadDriveFiles(currentDrive.id);
                    }}
                    onAfterRename={() => currentDrive && loadDriveFiles(currentDrive.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {currentDrive.id === creatorRawDriveId
                ? "No videos yet. Upload RAW footage to get started."
                : "No files in this folder yet."}
            </div>
          )
        ) : loading ? (
          <div className="py-12">
            <LoadingSpinner label={LOADING_COPY.default} />
          </div>
        ) : folderItems.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {folderItems.map((item) => {
              const drive = creatorDrives.find((d) => d.id === item.driveId);
              return (
                <div key={item.key}>
                  <FolderCard
                    item={item}
                    onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                    onDelete={
                      drive && !item.preventDelete
                        ? async () => {
                            const msg =
                              item.items === 0
                                ? `Delete "${item.name}"? This will remove the folder.`
                                : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`;
                            const ok = await confirm({ message: msg, destructive: true });
                            if (ok) {
                              await deleteFolder({ id: drive.id, name: drive.name }, item.items);
                              await refetch();
                            }
                          }
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No folders yet. The RAW folder will appear once you visit this tab.
          </div>
        )}
      </section>

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        showLUTForVideo={previewFile?.driveId === creatorRawDriveId}
      />
    </div>
  );
}
