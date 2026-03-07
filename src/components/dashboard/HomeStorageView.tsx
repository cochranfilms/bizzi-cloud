"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Trash2 } from "lucide-react";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { usePinned, fetchPinnedFiles } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import FolderCard, { type FolderItem } from "./FolderCard";
import FileCard from "./FileCard";
import FilePreviewModal from "./FilePreviewModal";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";

const DRAG_THRESHOLD_PX = 5;

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function BulkActionBar({
  selectedFileCount,
  selectedFolderCount,
  onDelete,
  onClear,
}: {
  selectedFileCount: number;
  selectedFolderCount: number;
  onDelete: () => void;
  onClear: () => void;
}) {
  const total = selectedFileCount + selectedFolderCount;
  const parts: string[] = [];
  if (selectedFileCount > 0) parts.push(`${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`);
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label} selected
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

interface HomeStorageViewProps {
  /** Base path for links: "/dashboard" or "/enterprise" */
  basePath?: string;
}

export default function HomeStorageView({ basePath = "/dashboard" }: HomeStorageViewProps) {
  const { driveFolders, loading, deleteFile, deleteFiles, deleteFolder, refetch } = useCloudFiles();
  const { pinnedFolderIds, pinnedFileIds, loading: pinnedLoading, refetch: refetchPinned } = usePinned();
  const { linkedDrives } = useBackup();
  const { setCurrentDrive: setCurrentFolderDriveId } = useCurrentFolder();
  const [pinnedFiles, setPinnedFiles] = useState<RecentFile[]>([]);
  const [pinnedFilesLoading, setPinnedFilesLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<{
    isActive: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const gridSectionRef = useRef<HTMLDivElement | null>(null);
  const { confirm } = useConfirm();

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

  const toggleFileSelection = useCallback((id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFolderSelection = useCallback((key: string) => {
    setSelectedFolderKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFileIds(new Set());
    setSelectedFolderKeys(new Set());
  }, []);

  const setSelectionFromDrag = useCallback((fileIds: string[], folderKeys: string[]) => {
    setSelectedFileIds(new Set(fileIds));
    setSelectedFolderKeys(new Set(folderKeys));
  }, []);

  const lastSelectionRef = useRef<{ files: string; folders: string } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-selectable-grid]")) return;
      if ((e.target as HTMLElement).closest("button, a, [role=button]")) return;
      lastSelectionRef.current = null;
      setDragState({
        isActive: true,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
    },
    []
  );

  useEffect(() => {
    if (!dragState?.isActive) return;

    const updateDrag = (e: MouseEvent) => {
      setDragState((prev) =>
        prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null
      );
    };

    const endDrag = (e: MouseEvent) => {
      const moved =
        Math.abs(e.clientX - dragState.startX) > DRAG_THRESHOLD_PX ||
        Math.abs(e.clientY - dragState.startY) > DRAG_THRESHOLD_PX;
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
      setDragState(null);
    };

    window.addEventListener("mousemove", updateDrag);
    window.addEventListener("mouseup", endDrag, true);
    return () => {
      window.removeEventListener("mousemove", updateDrag);
      window.removeEventListener("mouseup", endDrag, true);
    };
  }, [dragState?.isActive, dragState?.startX, dragState?.startY]);

  const selectionUpdateRef = useRef<number | null>(null);

  useEffect(() => {
    if (!dragState?.isActive) return;
    const moved =
      Math.abs(dragState.currentX - dragState.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(dragState.currentY - dragState.startY) > DRAG_THRESHOLD_PX;
    if (!moved) return;

    const runUpdate = () => {
      const left = Math.min(dragState.startX, dragState.currentX);
      const right = Math.max(dragState.startX, dragState.currentX);
      const top = Math.min(dragState.startY, dragState.currentY);
      const bottom = Math.max(dragState.startY, dragState.currentY);
      const dragRect = { left, top, right, bottom };

      const items = gridSectionRef.current?.querySelectorAll("[data-selectable-item]");
      const fileIds: string[] = [];
      const folderKeys: string[] = [];

      items?.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rectsIntersect(dragRect, rect)) return;
        const type = el.getAttribute("data-item-type");
        const id = el.getAttribute("data-item-id");
        const key = el.getAttribute("data-item-key");
        if (type === "file" && id) fileIds.push(id);
        if (type === "folder" && key) folderKeys.push(key);
      });

      const filesKey = [...fileIds].sort().join(",");
      const foldersKey = [...folderKeys].sort().join(",");
      if (
        lastSelectionRef.current?.files === filesKey &&
        lastSelectionRef.current?.folders === foldersKey
      ) {
        return;
      }
      lastSelectionRef.current = { files: filesKey, folders: foldersKey };
      setSelectionFromDrag(fileIds, folderKeys);
    };

    if (selectionUpdateRef.current !== null) {
      cancelAnimationFrame(selectionUpdateRef.current);
    }
    selectionUpdateRef.current = requestAnimationFrame(runUpdate);
    return () => {
      if (selectionUpdateRef.current !== null) {
        cancelAnimationFrame(selectionUpdateRef.current);
        selectionUpdateRef.current = null;
      }
    };
  }, [dragState, setSelectionFromDrag]);

  const handleBulkDelete = useCallback(async () => {
    const fileIds = Array.from(selectedFileIds);
    const folderKeys = Array.from(selectedFolderKeys);
    const fileCount = fileIds.length;
    const folderCount = folderKeys.length;
    const total = fileCount + folderCount;

    const fileMsg =
      fileCount > 0
        ? `${fileCount} file${fileCount === 1 ? "" : "s"} will be moved to trash. `
        : "";
    const folderMsg =
      folderCount > 0
        ? `${folderCount} folder${folderCount === 1 ? "" : "s"} will be moved to trash (or unlinked if empty). `
        : "";
    const ok = await confirm({
      message: `Delete ${total} item${total === 1 ? "" : "s"}? ${fileMsg}${folderMsg}You can restore files from the Deleted files tab.`,
      destructive: true,
    });
    if (!ok) return;

    try {
      if (fileIds.length > 0) await deleteFiles(fileIds);
      for (const key of folderKeys) {
        const driveId = key.startsWith("drive-") ? key.slice(6) : key;
        const drive = linkedDrives.find((d) => d.id === driveId);
        const itemCount = folderItems.find((f) => f.key === key)?.items ?? 0;
        if (drive) {
          await deleteFolder(drive, itemCount);
        }
      }
      clearSelection();
      await refetch();
      await refetchPinned();
      loadPinnedFiles();
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  }, [
    selectedFileIds,
    selectedFolderKeys,
    folderItems,
    deleteFiles,
    deleteFolder,
    linkedDrives,
    clearSelection,
    refetch,
    refetchPinned,
    loadPinnedFiles,
    confirm,
  ]);

  const hasPinned = pinnedFolderItems.length > 0 || pinnedFileIds.size > 0;
  const isLoading = loading || pinnedLoading;

  const showDragRect =
    dragState?.isActive &&
    (Math.abs(dragState.currentX - dragState.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(dragState.currentY - dragState.startY) > DRAG_THRESHOLD_PX);

  const dragRectEl =
    showDragRect && dragState ? (
      <div
        className="pointer-events-none fixed z-[9999] border-2 border-bizzi-blue bg-bizzi-blue/20 shadow-lg shadow-bizzi-blue/30"
        style={{
          left: Math.min(dragState.startX, dragState.currentX),
          top: Math.min(dragState.startY, dragState.currentY),
          width: Math.abs(dragState.currentX - dragState.startX),
          height: Math.abs(dragState.currentY - dragState.startY),
        }}
      />
    ) : null;

  return (
    <div
      ref={gridSectionRef}
      className={`mx-auto max-w-6xl space-y-8 ${dragState?.isActive ? "select-none" : ""}`}
      data-selectable-grid
      onMouseDown={handleMouseDown}
    >
      {typeof document !== "undefined" && dragRectEl && createPortal(dragRectEl, document.body)}
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
              {pinnedFolderItems.map((item) => {
                const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                return (
                  <div
                    key={item.key}
                    data-selectable-item
                    data-item-type="folder"
                    data-item-key={item.key}
                  >
                    <FolderCard
                      item={item}
                      onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                      onDelete={
                        drive
                          ? async () => {
                              const msg = item.items === 0
                                ? `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`
                                : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`;
                              const ok = await confirm({ message: msg, destructive: true });
                              if (ok) {
                                await deleteFolder(drive, item.items);
                                await refetch();
                                await refetchPinned();
                                loadPinnedFiles();
                              }
                            }
                          : undefined
                      }
                      selectable={!!drive}
                      selected={selectedFolderKeys.has(item.key)}
                      onSelect={() => toggleFolderSelection(item.key)}
                    />
                  </div>
                );
              })}
              {pinnedFiles.map((file) => (
                <div key={file.id} data-selectable-item data-item-type="file" data-item-id={file.id}>
                  <FileCard
                    file={file}
                    onClick={() => setPreviewFile(file)}
                    onDelete={async () => {
                      await deleteFile(file.id);
                      await refetch();
                      await refetchPinned();
                      loadPinnedFiles();
                    }}
                    selectable
                    selected={selectedFileIds.has(file.id)}
                    onSelect={() => toggleFileSelection(file.id)}
                  />
                </div>
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
            {folderItems.map((item) => {
              const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
              return (
                <div
                  key={item.key}
                  data-selectable-item
                  data-item-type="folder"
                  data-item-key={item.key}
                >
                  <FolderCard
                    item={item}
                    onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                    onDelete={
                      drive
                        ? async () => {
                            const msg = item.items === 0
                              ? `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`
                              : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`;
                            const ok = await confirm({ message: msg, destructive: true });
                            if (ok) {
                              await deleteFolder(drive, item.items);
                              await refetch();
                            }
                          }
                        : undefined
                    }
                    selectable={!!drive}
                    selected={selectedFolderKeys.has(item.key)}
                    onSelect={() => toggleFolderSelection(item.key)}
                  />
                </div>
              );
            })}
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

      {selectedFileIds.size + selectedFolderKeys.size > 0 && (
        <BulkActionBar
          selectedFileCount={selectedFileIds.size}
          selectedFolderCount={selectedFolderKeys.size}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
