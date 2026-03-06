"use client";

import { useCallback, useState } from "react";
import { Folder, LayoutGrid, List, ChevronLeft } from "lucide-react";
import FolderCard, { type FolderItem } from "./FolderCard";
import FileCard from "./FileCard";
import FilePreviewModal from "./FilePreviewModal";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useBackup } from "@/context/BackupContext";
import type { LinkedDrive } from "@/types/backup";
import ItemActionsMenu from "./ItemActionsMenu";

function PinnedFolderActions({
  drive,
  itemName,
  currentDriveId,
  unlinkDrive,
  closeDrive,
}: {
  drive: LinkedDrive;
  itemName: string;
  currentDriveId: string | undefined;
  unlinkDrive: (d: LinkedDrive) => Promise<void>;
  closeDrive: () => void;
}) {
  return (
    <ItemActionsMenu
      actions={[
        {
          id: "delete",
          label: "Delete",
          onClick: async () => {
            if (window.confirm(`Delete "${itemName}"? This will unlink the drive and remove it from your backups.`)) {
              await unlinkDrive(drive);
              if (currentDriveId === drive.id) closeDrive();
            }
          },
          destructive: true,
        },
      ]}
      ariaLabel="Folder actions"
      alignRight
    />
  );
}

export default function FileGrid() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"recents" | "starred">("recents");
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [currentDrive, setCurrentDrive] = useState<{ id: string; name: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<RecentFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const { driveFolders, recentFiles, loading, fetchDriveFiles, deleteFile } = useCloudFiles();
  const { unlinkDrive, linkedDrives } = useBackup();

  const folderItems: FolderItem[] = driveFolders.map((d) => ({
    name: d.name,
    type: "folder" as const,
    key: d.key,
    items: d.items,
    hideShare: true,
    driveId: d.id,
  }));
  const pinnedFolders = folderItems.slice(0, 3);

  const loadDriveFiles = useCallback(
    async (driveId: string) => {
      setDriveFilesLoading(true);
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
      setCurrentDrive({ id, name });
      loadDriveFiles(id);
    },
    [loadDriveFiles]
  );

  const closeDrive = useCallback(() => {
    setCurrentDrive(null);
    setDriveFiles([]);
  }, []);

  const currentDriveId = currentDrive?.id;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Breadcrumb when inside a drive */}
      {currentDrive && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={closeDrive}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-neutral-400 dark:text-neutral-500">/</span>
          <span className="font-medium text-neutral-900 dark:text-white">
            {currentDrive.name}
          </span>
        </div>
      )}

      {/* Pinned shortcuts (only at root) */}
      {!currentDrive && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/50">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Pinned
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pinnedFolders.map((item) => {
              const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
              return (
                <div
                  key={item.key}
                  className="group relative flex min-w-[120px] flex-col items-center rounded-xl bg-neutral-50 p-4 transition-colors hover:bg-bizzi-blue/5 dark:bg-neutral-800/50 dark:hover:bg-bizzi-blue/10"
                >
                  <button
                    type="button"
                    onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                    className="flex w-full flex-col items-center"
                  >
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-blue/25">
                      <Folder className="h-5 w-5" />
                    </div>
                    <p className="truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white">
                      {item.name}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Folder
                    </p>
                  </button>
                  {drive && (
                    <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <PinnedFolderActions
                        drive={drive}
                        itemName={item.name}
                        currentDriveId={undefined}
                        unlinkDrive={unlinkDrive}
                        closeDrive={closeDrive}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recents / Starred tabs + view toggle (only at root, or when in drive show "Files") */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1.5 dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setActiveTab("recents")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "recents"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              Recents
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("starred")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "starred"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              Starred
            </button>
          </div>
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

        {/* File grid */}
        {currentDrive ? (
          driveFilesLoading ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Loading files…
            </div>
          ) : driveFiles.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {driveFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  onClick={() => setPreviewFile(file)}
                  onDelete={async () => {
                    await deleteFile(file.id);
                    if (currentDrive) loadDriveFiles(currentDrive.id);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No files in this drive yet. Sync to add files.
            </div>
          )
        ) : loading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading your files…
          </div>
        ) : activeTab === "recents" ? (
          <>
            {folderItems.length > 0 && (
              <>
                <h3 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Your synced drives
                </h3>
                <div className="mb-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {folderItems.map((item) => {
                    const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                    const driveId = drive?.id;
                    return (
                      <FolderCard
                        key={item.key}
                        item={item}
                        onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                        onDelete={drive ? async () => {
                          await unlinkDrive(drive);
                          if (currentDriveId === driveId) closeDrive();
                        } : undefined}
                      />
                    );
                  })}
                </div>
              </>
            )}
            {recentFiles.length > 0 && (
              <>
                <h3 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Recently synced files
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {recentFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      onClick={() => setPreviewFile(file)}
                      onDelete={async () => {
                        await deleteFile(file.id);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            {!loading && folderItems.length === 0 && recentFiles.length === 0 && (
              <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No files yet. Click Sync in the Backup section to sync a drive.
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Starred files coming soon. Use Recents to see your synced drives and recent files.
          </div>
        )}
      </section>

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
