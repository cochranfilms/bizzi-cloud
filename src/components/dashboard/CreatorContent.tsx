"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Film } from "lucide-react";
import type { FolderItem } from "./FolderCard";
import FolderCard from "./FolderCard";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FilePreviewModal from "./FilePreviewModal";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";
import DashboardRouteFade from "./DashboardRouteFade";
import SectionTitle from "./SectionTitle";
import { useAuth } from "@/context/AuthContext";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";

const DRAG_THRESHOLD_PX = 5;

export default function CreatorContent() {
  const { viewMode, cardSize, aspectRatio, showCardInfo, thumbnailScale } =
    useLayoutSettings();
  const gridGapClass = viewMode === "thumbnail" ? "gap-3" : "gap-4";
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [currentDrive, setCurrentDrive] = useState<{ id: string; name: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<RecentFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [lutConfig, setLutConfig] = useState<CreativeLUTConfig | null>(null);
  const [lutLibrary, setLutLibrary] = useState<CreativeLUTLibraryEntry[]>([]);
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
  const { user } = useAuth();
  const { setCurrentDrive: setCurrentFolderDriveId } = useCurrentFolder();
  const { confirm } = useConfirm();

  const creatorDrives = linkedDrives.filter(
    (d) => d.creator_section && d.is_org_shared !== true
  );

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

  // Fetch LUT config for Creator RAW drive
  useEffect(() => {
    if (!creatorRawDriveId || !user) return;
    let cancelled = false;
    user.getIdToken().then((token) => {
      if (cancelled) return;
      return fetch(`/api/drives/${creatorRawDriveId}/lut`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }).then((res) => {
      if (!res || cancelled) return res?.json?.();
      return res.json();
    }).then((data) => {
      if (cancelled || !data) return;
      setLutConfig(data.creative_lut_config ?? null);
      setLutLibrary(data.creative_lut_library ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [creatorRawDriveId, user]);

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

  const gridColsClass =
    viewMode === "thumbnail"
      ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      : cardSize === "small"
        ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        : cardSize === "large"
          ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
          : "sm:grid-cols-3 md:grid-cols-4";

  const folderLayoutSize = viewMode === "thumbnail" ? "large" : cardSize;

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
        <div className="mb-5">
          <SectionTitle>{currentDrive ? "Files" : "Folders"}</SectionTitle>
        </div>

        <DashboardRouteFade
          ready={currentDrive ? !driveFilesLoading : !loading}
          srOnlyMessage={currentDrive ? "Loading files" : "Loading creator folders"}
        >
        {currentDrive ? (
          driveFiles.length > 0 ? (
            viewMode === "list" ? (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-x-auto dark:border-neutral-700 dark:bg-neutral-900">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className="w-10 px-3 py-3 font-medium text-neutral-900 dark:text-white" />
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Name</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Type</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Size</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Modified</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Owner</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Resolution</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Duration</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Codec</th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white" />
                    </tr>
                  </thead>
                  <tbody>
                    {driveFiles.map((file) => (
                      <FileListRow
                        key={file.id}
                        file={file}
                        onClick={() => setPreviewFile(file)}
                        onDelete={async () => {
                          await deleteFile(file.id);
                          if (currentDrive) loadDriveFiles(currentDrive.id);
                        }}
                        onAfterRename={() => currentDrive && loadDriveFiles(currentDrive.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={`grid ${gridGapClass} ${gridColsClass}`}>
                {driveFiles.map((file) => (
                  <div key={file.id} className="h-full min-h-0">
                    <FileCard
                      file={file}
                      onClick={() => setPreviewFile(file)}
                      onDelete={async () => {
                        await deleteFile(file.id);
                        if (currentDrive) loadDriveFiles(currentDrive.id);
                      }}
                      onAfterRename={() => currentDrive && loadDriveFiles(currentDrive.id)}
                      layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                      layoutAspectRatio={aspectRatio}
                      showCardInfo={showCardInfo}
                      thumbnailScale={thumbnailScale}
                      presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
                    />
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {currentDrive.id === creatorRawDriveId
                ? "No videos yet. Upload RAW footage to get started."
                : "No files in this folder yet."}
            </div>
          )
        ) : folderItems.length > 0 ? (
          viewMode === "list" ? (
            <div className="space-y-3">
              {folderItems.map((item) => {
                const drive = creatorDrives.find((d) => d.id === item.driveId);
                return (
                  <FolderCard
                    key={item.key}
                    item={item}
                    layoutSize={folderLayoutSize}
                    layoutAspectRatio={aspectRatio}
                    showCardInfo={showCardInfo}
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
                );
              })}
            </div>
          ) : (
            <div className={`grid ${gridGapClass} ${gridColsClass}`}>
              {folderItems.map((item) => {
                const drive = creatorDrives.find((d) => d.id === item.driveId);
                return (
                  <div key={item.key}>
                    <FolderCard
                      item={item}
                      layoutSize={folderLayoutSize}
                      layoutAspectRatio={aspectRatio}
                      showCardInfo={showCardInfo}
                      presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
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
          )
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No folders yet. The RAW folder will appear once you visit this tab.
          </div>
        )}
        </DashboardRouteFade>
      </section>

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        lutConfig={previewFile?.driveId === creatorRawDriveId ? lutConfig : null}
        lutLibrary={previewFile?.driveId === creatorRawDriveId ? lutLibrary : null}
      />
    </div>
  );
}
