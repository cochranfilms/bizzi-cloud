"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckSquare, ChevronLeft, Film } from "lucide-react";
import type { FolderItem } from "./FolderCard";
import FolderCard from "./FolderCard";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FilePreviewModal from "./FilePreviewModal";
import BulkMoveModal from "./BulkMoveModal";
import CreateTransferModal, { type TransferModalFile } from "./CreateTransferModal";
import ShareModal from "./ShareModal";
import { BulkActionBar } from "./BulkActionBar";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { useBulkDownload } from "@/hooks/useBulkDownload";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { filterLinkedDrivesByPowerUp } from "@/lib/drive-powerup-filter";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";
import DashboardRouteFade from "./DashboardRouteFade";
import SectionTitle from "./SectionTitle";
import { useAuth } from "@/context/AuthContext";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";
import { isCreatorRawDriveId } from "@/lib/creator-raw-drive";
import { CREATOR_RAW_TAB_INTRO } from "@/lib/creator-raw-media-config";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";

type RawDriveLutPayload = {
  config: CreativeLUTConfig;
  library: CreativeLUTLibraryEntry[];
};

export default function CreatorContent() {
  const { viewMode, cardSize, aspectRatio, showCardInfo, thumbnailScale } =
    useLayoutSettings();
  const gridGapClass = viewMode === "thumbnail" ? "gap-3" : "gap-4";
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [currentDrive, setCurrentDrive] = useState<{ id: string; name: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<RecentFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  /** LUT library + config per Creator RAW drive (`is_creator_raw`), including org-shared RAW. */
  const [rawDriveLutById, setRawDriveLutById] = useState<Record<string, RawDriveLutPayload>>({});
  const {
    driveFolders,
    loading,
    fetchDriveFiles,
    deleteFile,
    deleteFiles,
    deleteFolder,
    refetch,
    fetchFilesByIds,
    getFileIdsForBulkShare,
    moveFilesToFolder,
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
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();
  const { download: bulkDownload, isLoading: isBulkDownloading } = useBulkDownload({
    fetchFilesByIds,
  });

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFolderName, setShareFolderName] = useState("");
  const [shareDriveId, setShareDriveId] = useState<string | null>(null);
  const [shareReferencedFileIds, setShareReferencedFileIds] = useState<string[]>([]);
  const [shareInitialData, setShareInitialData] = useState<{
    token: string;
    accessLevel: "private" | "public";
    permission: "view" | "edit";
    invitedEmails: string[];
  } | null>(null);
  const [transferInitialFiles, setTransferInitialFiles] = useState<TransferModalFile[]>([]);
  const didAutoOpenRawRef = useRef(false);

  const clearSelection = useCallback(() => setSelectedFileIds(new Set()), []);
  const toggleFileSelection = useCallback((id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!moveNotice) return;
    const t = window.setTimeout(() => setMoveNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [moveNotice]);

  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [currentDrive?.id]);

  const creatorDrives = linkedDrives.filter(
    (d) => d.creator_section && d.is_org_shared !== true
  );

  const storageDisplayContext = useMemo(() => ({ locationScope: "personal" as const }), []);

  const loadDriveFiles = useCallback(
    async (driveId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setDriveFilesLoading(true);
      try {
        const { files } = await fetchDriveFiles(driveId);
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

  useEffect(() => {
    if (didAutoOpenRawRef.current || !creatorRawDriveId) return;
    const rawDrive = linkedDrives.find((d) => d.id === creatorRawDriveId);
    if (!rawDrive) return;
    didAutoOpenRawRef.current = true;
    openDrive(creatorRawDriveId, rawDrive.name?.trim() || "RAW");
  }, [creatorRawDriveId, linkedDrives, openDrive]);

  const visibleLinkedDrives = useMemo(
    () => filterLinkedDrivesByPowerUp(linkedDrives, { hasEditor, hasGallerySuite }),
    [linkedDrives, hasEditor, hasGallerySuite]
  );

  const handleBulkDownload = useCallback(() => {
    bulkDownload(Array.from(selectedFileIds));
  }, [bulkDownload, selectedFileIds]);

  const handleBulkDelete = useCallback(async () => {
    const fileIds = Array.from(selectedFileIds);
    if (fileIds.length === 0) return;
    const ok = await confirm({
      message: `Move ${fileIds.length} file${fileIds.length === 1 ? "" : "s"} to trash? You can restore from the Deleted files tab.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFiles(fileIds);
      clearSelection();
      await refetch();
      if (currentDrive) await loadDriveFiles(currentDrive.id);
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  }, [
    selectedFileIds,
    confirm,
    deleteFiles,
    clearSelection,
    refetch,
    currentDrive,
    loadDriveFiles,
  ]);

  const performMove = useCallback(
    async (fileIds: string[], targetDriveId: string) => {
      if (fileIds.length > 0) {
        await moveFilesToFolder(fileIds, targetDriveId);
      }
      clearSelection();
      await refetch();
      if (currentDrive) await loadDriveFiles(currentDrive.id);
      const destName = linkedDrives.find((d) => d.id === targetDriveId)?.name ?? "folder";
      setMoveNotice(`Items moved into the "${destName}" folder`);
    },
    [moveFilesToFolder, clearSelection, refetch, currentDrive, loadDriveFiles, linkedDrives]
  );

  const handleBulkMoveConfirm = useCallback(
    async (targetDriveId: string) => {
      await performMove(Array.from(selectedFileIds), targetDriveId);
      setMoveModalOpen(false);
    },
    [selectedFileIds, performMove]
  );

  const handleBulkMove = useCallback(() => setMoveModalOpen(true), []);

  const handleBulkNewTransfer = useCallback(async () => {
    const fileIds = Array.from(selectedFileIds);
    if (fileIds.length === 0) return;
    const files = await fetchFilesByIds(fileIds);
    setTransferInitialFiles(
      files.map((f) => ({
        name: f.name,
        path: `${f.driveName}/${f.path}`.replace(/\/+/g, "/"),
        type: "file" as const,
        backupFileId: f.id,
        objectKey: f.objectKey,
      }))
    );
    setTransferModalOpen(true);
  }, [selectedFileIds, fetchFilesByIds]);

  const handleBulkShare = useCallback(async () => {
    const fileIds = Array.from(selectedFileIds);
    try {
      const allFileIds = await getFileIdsForBulkShare(fileIds, []);
      if (allFileIds.length === 0) return;
      const defaultFolderName = `Share ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;
      setShareFolderName(defaultFolderName);
      setShareReferencedFileIds(allFileIds);
      setShareDriveId(null);
      setShareInitialData(null);
      setShareModalOpen(true);
      clearSelection();
      await refetch();
    } catch (err) {
      console.error("Bulk share failed:", err);
    }
  }, [selectedFileIds, getFileIdsForBulkShare, clearSelection, refetch]);

  // Ensure RAW drive exists on mount
  useEffect(() => {
    getOrCreateCreatorRawDrive().catch(console.error);
  }, [getOrCreateCreatorRawDrive]);

  const creatorRawDriveIds = useMemo(
    () => linkedDrives.filter((d) => d.is_creator_raw === true).map((d) => d.id),
    [linkedDrives]
  );

  useEffect(() => {
    if (!user || creatorRawDriveIds.length === 0) {
      setRawDriveLutById({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        if (!token || cancelled) return;
        const results = await Promise.all(
          creatorRawDriveIds.map(async (driveId) => {
            try {
              const res = await fetch(`/api/drives/${encodeURIComponent(driveId)}/lut`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return { driveId, payload: null as RawDriveLutPayload | null };
              const data = (await res.json()) as {
                creative_lut_config?: CreativeLUTConfig | null;
                creative_lut_library?: CreativeLUTLibraryEntry[];
              };
              return {
                driveId,
                payload: {
                  config: (data.creative_lut_config ?? {}) as CreativeLUTConfig,
                  library: data.creative_lut_library ?? [],
                },
              };
            } catch {
              return { driveId, payload: null };
            }
          })
        );
        if (cancelled) return;
        const next: Record<string, RawDriveLutPayload> = {};
        for (const { driveId, payload } of results) {
          if (payload) next[driveId] = payload;
        }
        setRawDriveLutById(next);
      } catch {
        if (!cancelled) setRawDriveLutById({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, creatorRawDriveIds, storageVersion]);

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

  const previewOnCreatorRaw = Boolean(
    previewFile && isCreatorRawDriveId(previewFile.driveId, linkedDrives)
  );
  const previewRawDriveId = previewFile?.driveId;

  const viewingCreatorRaw = Boolean(
    currentDrive &&
      linkedDrives.find((d) => d.id === currentDrive.id)?.is_creator_raw === true
  );

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
        <div className="mb-5 w-full">
          <div className="w-full" role={viewingCreatorRaw ? "status" : undefined}>
            <SectionTitle as="div" className="w-full py-3 normal-case">
              <span className="block text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                {currentDrive ? "Files" : "Folders"}
              </span>
              {viewingCreatorRaw ? (
                <>
                  <p className="mt-2 text-center text-xs font-semibold normal-case tracking-normal text-neutral-800 dark:text-neutral-100">
                    {CREATOR_RAW_TAB_INTRO.line1}
                  </p>
                  <p className="mt-1 text-center text-xs font-normal normal-case leading-snug tracking-normal text-neutral-600 dark:text-neutral-400">
                    {CREATOR_RAW_TAB_INTRO.line2}
                  </p>
                </>
              ) : null}
            </SectionTitle>
          </div>
        </div>

        {currentDrive && driveFiles.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedFileIds(new Set(driveFiles.map((f) => f.id)))}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              aria-label="Select all"
            >
              <CheckSquare className="h-4 w-4" />
              Select
            </button>
          </div>
        ) : null}

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
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Location</th>
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
                        displayContext={storageDisplayContext}
                        selectable
                        selected={selectedFileIds.has(file.id)}
                        onSelect={() => toggleFileSelection(file.id)}
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
                      selectable
                      selected={selectedFileIds.has(file.id)}
                      onSelect={() => toggleFileSelection(file.id)}
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
              {linkedDrives.find((d) => d.id === currentDrive.id)?.is_creator_raw === true
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

      {moveNotice ? (
        <div
          role="status"
          className="fixed bottom-[max(12rem,calc(env(safe-area-inset-bottom,0px)+10rem))] left-1/2 z-[45] flex max-w-[min(92vw,24rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-lg dark:border-emerald-800/60 dark:bg-emerald-950/90 dark:text-emerald-100"
        >
          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
          <span className="text-left">{moveNotice}</span>
        </div>
      ) : null}

      {selectedFileIds.size > 0 ? (
        <BulkActionBar
          selectedFileCount={selectedFileIds.size}
          selectedFolderCount={0}
          onMove={handleBulkMove}
          onNewTransfer={handleBulkNewTransfer}
          onShare={handleBulkShare}
          onDownload={handleBulkDownload}
          isDownloading={isBulkDownloading}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      ) : null}

      <BulkMoveModal
        open={moveModalOpen}
        onClose={() => setMoveModalOpen(false)}
        selectedFileCount={selectedFileIds.size}
        selectedFolderCount={0}
        excludeDriveIds={currentDrive ? [currentDrive.id] : []}
        folders={visibleLinkedDrives}
        onMove={handleBulkMoveConfirm}
      />

      <CreateTransferModal
        open={transferModalOpen}
        onClose={() => {
          setTransferModalOpen(false);
          setTransferInitialFiles([]);
        }}
        onCreated={() => setTransferModalOpen(false)}
        initialFiles={transferInitialFiles}
      />

      {shareModalOpen ? (
        <ShareModal
          open={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setShareDriveId(null);
            setShareReferencedFileIds([]);
            setShareInitialData(null);
          }}
          folderName={shareFolderName}
          linkedDriveId={shareDriveId ?? undefined}
          referencedFileIds={shareReferencedFileIds.length > 0 ? shareReferencedFileIds : undefined}
          initialShareToken={shareInitialData?.token}
          initialAccessLevel={shareInitialData?.accessLevel}
          initialPermission={shareInitialData?.permission}
          initialInvitedEmails={shareInitialData?.invitedEmails}
        />
      ) : null}

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        showLUTForVideo={previewOnCreatorRaw}
        lutConfig={
          previewOnCreatorRaw && previewRawDriveId
            ? (rawDriveLutById[previewRawDriveId]?.config ?? null)
            : null
        }
        lutLibrary={
          previewOnCreatorRaw && previewRawDriveId
            ? (rawDriveLutById[previewRawDriveId]?.library ?? null)
            : null
        }
      />
    </div>
  );
}
