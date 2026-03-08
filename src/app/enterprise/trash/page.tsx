"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FileIcon, Folder, RotateCcw, Trash2 } from "lucide-react";
import TopBar from "@/components/dashboard/TopBar";
import ItemActionsMenu from "@/components/dashboard/ItemActionsMenu";
import { useCloudFiles, type RecentFile, type DeletedDrive } from "@/hooks/useCloudFiles";
import { useConfirm } from "@/hooks/useConfirm";

const TRASH_DND_TYPE = "application/x-bizzi-trash-delete";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DeletedFolderCard({
  folder,
  selected,
  onSelect,
  onRestore,
  onPermanentDelete,
  draggable,
  onDragStart,
}: {
  folder: DeletedDrive;
  selected?: boolean;
  onSelect?: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`group relative flex flex-col items-center rounded-xl border p-6 transition-colors ${
        selected
          ? "border-[var(--enterprise-primary)] ring-2 ring-[var(--enterprise-primary)]/50 bg-[var(--enterprise-primary)]/5"
          : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
            selected
              ? "border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]"
              : "border-neutral-300 bg-transparent dark:border-neutral-600"
          }`}
          aria-label={selected ? "Deselect" : "Select"}
          aria-pressed={selected}
        >
          {selected && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
        </button>
      )}
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <ItemActionsMenu
          actions={[
            {
              id: "restore",
              label: "Restore to original location",
              icon: <RotateCcw className="h-4 w-4" />,
              onClick: onRestore,
            },
            {
              id: "permanent",
              label: "Permanently delete",
              icon: <Trash2 className="h-4 w-4" />,
              onClick: onPermanentDelete,
              destructive: true,
            },
          ]}
          ariaLabel="Folder actions"
          alignRight
        />
      </div>
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--enterprise-primary)]/10 text-[var(--enterprise-primary)]">
        <Folder className="h-8 w-8" />
      </div>
      <h3
        className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white"
        title={folder.name}
      >
        {folder.name}
      </h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {folder.items} {folder.items === 1 ? "item" : "items"}
      </p>
      <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
        Deleted {formatDate(folder.deletedAt)}
      </p>
    </div>
  );
}

function DeletedFileCard({
  file,
  selected,
  onSelect,
  onRestore,
  onPermanentDelete,
  draggable,
  onDragStart,
}: {
  file: RecentFile;
  selected?: boolean;
  onSelect?: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`group relative flex flex-col items-center rounded-xl border p-6 transition-colors ${
        selected
          ? "border-[var(--enterprise-primary)] ring-2 ring-[var(--enterprise-primary)]/50 bg-[var(--enterprise-primary)]/5"
          : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
            selected
              ? "border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]"
              : "border-neutral-300 bg-transparent dark:border-neutral-600"
          }`}
          aria-label={selected ? "Deselect" : "Select"}
          aria-pressed={selected}
        >
          {selected && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
        </button>
      )}
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <ItemActionsMenu
          actions={[
            {
              id: "restore",
              label: "Restore to original location",
              icon: <RotateCcw className="h-4 w-4" />,
              onClick: onRestore,
            },
            {
              id: "permanent",
              label: "Permanently delete",
              icon: <Trash2 className="h-4 w-4" />,
              onClick: onPermanentDelete,
              destructive: true,
            },
          ]}
          ariaLabel="File actions"
          alignRight
        />
      </div>
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
        <FileIcon className="h-8 w-8" />
      </div>
      <h3
        className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white"
        title={file.name}
      >
        {file.name}
      </h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {formatBytes(file.size)} · {file.driveName}
      </p>
      <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
        Deleted {formatDate(file.deletedAt ?? null)}
      </p>
    </div>
  );
}

export default function EnterpriseTrashPage() {
  const [deletedFiles, setDeletedFiles] = useState<RecentFile[]>([]);
  const [deletedDrives, setDeletedDrives] = useState<DeletedDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);
  const { confirm } = useConfirm();
  const {
    fetchDeletedFiles,
    fetchDeletedDrives,
    restoreFile,
    restoreDrive,
    permanentlyDeleteFile,
    permanentlyDeleteDrive,
    refetch,
  } = useCloudFiles();

  const toggleFileSelection = useCallback((id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFolderSelection = useCallback((id: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
  }, []);

  const hasSelection = selectedFileIds.size + selectedFolderIds.size > 0;
  const selectedCount = selectedFileIds.size + selectedFolderIds.size;

  const loadDeleted = async () => {
    setLoading(true);
    try {
      const [files, drives] = await Promise.all([
        fetchDeletedFiles(),
        fetchDeletedDrives(),
      ]);
      setDeletedFiles(files);
      setDeletedDrives(drives);
    } catch {
      setDeletedFiles([]);
      setDeletedDrives([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeleted();
  }, [fetchDeletedFiles, fetchDeletedDrives]);

  const handleRestoreFile = async (fileId: string) => {
    try {
      await restoreFile(fileId);
      refetch();
      setDeletedFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      await loadDeleted();
    }
  };

  const handlePermanentDeleteFile = async (file: RecentFile) => {
    const ok = await confirm({
      message: `Permanently delete "${file.name}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await permanentlyDeleteFile(file.id);
      refetch();
      setDeletedFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      await loadDeleted();
    }
  };

  const handleRestoreDrive = async (driveId: string) => {
    try {
      await restoreDrive(driveId);
      refetch();
      setDeletedDrives((prev) => prev.filter((d) => d.id !== driveId));
    } catch {
      await loadDeleted();
    }
  };

  const handlePermanentDeleteDrive = async (folder: DeletedDrive) => {
    const ok = await confirm({
      message: `Permanently delete "${folder.name}" and all its contents? This action cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await permanentlyDeleteDrive(folder.id);
      refetch();
      setDeletedDrives((prev) => prev.filter((d) => d.id !== folder.id));
    } catch {
      await loadDeleted();
    }
  };

  const handleBulkRestore = useCallback(async () => {
    if (!hasSelection) return;
    setDeletingBulk(true);
    try {
      for (const id of selectedFileIds) {
        await restoreFile(id);
      }
      for (const id of selectedFolderIds) {
        await restoreDrive(id);
      }
      refetch();
      setDeletedFiles((prev) => prev.filter((f) => !selectedFileIds.has(f.id)));
      setDeletedDrives((prev) => prev.filter((d) => !selectedFolderIds.has(d.id)));
      clearSelection();
    } catch {
      await loadDeleted();
    } finally {
      setDeletingBulk(false);
    }
  }, [
    hasSelection,
    selectedFileIds,
    selectedFolderIds,
    restoreFile,
    restoreDrive,
    refetch,
    clearSelection,
  ]);

  const doBulkPermanentDelete = useCallback(
    async (fileIds: string[], folderIds: string[]) => {
      if (fileIds.length === 0 && folderIds.length === 0) return;
      const fileCount = fileIds.length;
      const folderCount = folderIds.length;
      const msg =
        fileCount > 0 && folderCount > 0
          ? `Permanently delete ${fileCount} file${fileCount === 1 ? "" : "s"} and ${folderCount} folder${folderCount === 1 ? "" : "s"}? This cannot be undone.`
          : fileCount > 0
            ? `Permanently delete ${fileCount} file${fileCount === 1 ? "" : "s"}? This cannot be undone.`
            : `Permanently delete ${folderCount} folder${folderCount === 1 ? "" : "s"} and their contents? This cannot be undone.`;
      const ok = await confirm({ message: msg, destructive: true });
      if (!ok) return;
      setDeletingBulk(true);
      try {
        const fileSet = new Set(fileIds);
        const folderSet = new Set(folderIds);
        for (const id of fileIds) {
          await permanentlyDeleteFile(id);
        }
        for (const id of folderIds) {
          await permanentlyDeleteDrive(id);
        }
        refetch();
        setDeletedFiles((prev) => prev.filter((f) => !fileSet.has(f.id)));
        setDeletedDrives((prev) => prev.filter((d) => !folderSet.has(d.id)));
        setSelectedFileIds((prev) => {
          const next = new Set(prev);
          fileIds.forEach((id) => next.delete(id));
          return next;
        });
        setSelectedFolderIds((prev) => {
          const next = new Set(prev);
          folderIds.forEach((id) => next.delete(id));
          return next;
        });
      } catch {
        await loadDeleted();
      } finally {
        setDeletingBulk(false);
      }
    },
    [
      permanentlyDeleteFile,
      permanentlyDeleteDrive,
      refetch,
      confirm,
    ]
  );

  const handleBulkPermanentDelete = useCallback(async () => {
    if (!hasSelection) return;
    await doBulkPermanentDelete(
      Array.from(selectedFileIds),
      Array.from(selectedFolderIds)
    );
    clearSelection();
  }, [hasSelection, selectedFileIds, selectedFolderIds, doBulkPermanentDelete, clearSelection]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!hasSelection) return;
      e.dataTransfer.setData(
        TRASH_DND_TYPE,
        JSON.stringify({
          fileIds: Array.from(selectedFileIds),
          folderIds: Array.from(selectedFolderIds),
        })
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [hasSelection, selectedFileIds, selectedFolderIds]
  );

  const handleDropZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(TRASH_DND_TYPE);
      if (!raw) return;
      try {
        const { fileIds, folderIds } = JSON.parse(raw) as {
          fileIds: string[];
          folderIds: string[];
        };
        doBulkPermanentDelete(fileIds, folderIds);
      } catch {
        // Ignore invalid drop data
      }
    },
    [doBulkPermanentDelete]
  );

  const handleDropZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const hasItems = deletedFiles.length > 0 || deletedDrives.length > 0;

  return (
    <>
      <TopBar title="Deleted" />
      <main className="flex-1 overflow-auto p-6">
        <p className="mb-6 text-neutral-500 dark:text-neutral-400">
          Deleted files and folders are kept for 30 days before permanent
          deletion. Restore them to their original location or permanently
          delete them.
        </p>

        {hasSelection && (
          <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {selectedCount} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkRestore}
                disabled={deletingBulk}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <RotateCcw className="h-4 w-4" />
                Restore
              </button>
              <button
                type="button"
                onClick={handleBulkPermanentDelete}
                disabled={deletingBulk}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
                Permanently delete
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}

        {hasSelection && hasItems && (
          <div
            onDrop={handleDropZoneDrop}
            onDragOver={handleDropZoneDragOver}
            className="mb-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-red-200 bg-red-50/50 py-8 dark:border-red-800 dark:bg-red-950/20"
          >
            <Trash2 className="mb-2 h-10 w-10 text-red-500 dark:text-red-400" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Drag selected items here to permanently delete
            </p>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading…
          </div>
        ) : hasItems ? (
          <div className="space-y-8">
            {deletedDrives.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Deleted folders
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {deletedDrives.map((folder) => (
                    <DeletedFolderCard
                      key={folder.id}
                      folder={folder}
                      selected={selectedFolderIds.has(folder.id)}
                      onSelect={() => toggleFolderSelection(folder.id)}
                      onRestore={() => handleRestoreDrive(folder.id)}
                      onPermanentDelete={() =>
                        handlePermanentDeleteDrive(folder)
                      }
                      draggable={hasSelection && selectedFolderIds.has(folder.id)}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </div>
              </>
            )}
            {deletedFiles.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Deleted files
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {deletedFiles.map((file) => (
                    <DeletedFileCard
                      key={file.id}
                      file={file}
                      selected={selectedFileIds.has(file.id)}
                      onSelect={() => toggleFileSelection(file.id)}
                      onRestore={() => handleRestoreFile(file.id)}
                      onPermanentDelete={() =>
                        handlePermanentDeleteFile(file)
                      }
                      draggable={hasSelection && selectedFileIds.has(file.id)}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No deleted files or folders. When you delete files or folders with
            contents from your drives, they will appear here.
          </div>
        )}
      </main>
    </>
  );
}
