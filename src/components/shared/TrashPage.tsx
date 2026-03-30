"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Check, FileIcon, Film, Folder, Play, RotateCcw, Trash2 } from "lucide-react";
import TopBar from "@/components/dashboard/TopBar";
import ItemActionsMenu from "@/components/dashboard/ItemActionsMenu";
import VideoScrubThumbnail from "@/components/dashboard/VideoScrubThumbnail";
import { useCloudFiles, type RecentFile, type DeletedDrive } from "@/hooks/useCloudFiles";
import { useConfirm } from "@/hooks/useConfirm";
import { useDragToSelectAutoScroll } from "@/hooks/useDragToSelectAutoScroll";
import { useInView } from "@/hooks/useInView";
import { usePdfThumbnail } from "@/hooks/usePdfThumbnail";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { useBackupVideoStreamUrl } from "@/hooks/useVideoStreamUrl";
import { getCardAspectClass } from "@/lib/card-aspect-utils";
import { GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import { isAppleDoubleLeafName } from "@/lib/apple-double-files";
import { rectsIntersect, formatBytes, formatDate } from "@/lib/utils";
import {
  recentFileToCreativeThumbnailSource,
  resolveCreativeProjectTile,
} from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";

function isVideoFile(name: string) {
  return GALLERY_VIDEO_EXT.test(name.toLowerCase());
}
function isPdfFile(name: string) {
  return /\.pdf$/i.test(name);
}

const DRAG_THRESHOLD_PX = 5;

export type TrashPageVariant = "dashboard" | "enterprise";

const ACCENT = {
  dashboard: {
    card: "border-bizzi-blue ring-2 ring-bizzi-blue/50 bg-bizzi-blue/5 dark:border-bizzi-blue dark:bg-bizzi-blue/10",
    checkbox: "border-bizzi-blue bg-bizzi-blue dark:border-bizzi-blue",
    folderIcon: "bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20",
    dragRect: "border-bizzi-blue bg-bizzi-blue/20 shadow-lg shadow-bizzi-blue/30",
  },
  enterprise: {
    card: "border-[var(--enterprise-primary)] ring-2 ring-[var(--enterprise-primary)]/50 bg-[var(--enterprise-primary)]/5",
    checkbox: "border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]",
    folderIcon: "bg-[var(--enterprise-primary)]/10 text-[var(--enterprise-primary)]",
    dragRect: "border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/20 shadow-lg shadow-[var(--enterprise-primary)]/30",
  },
} as const;

function DeletedFolderCard({
  folder,
  selected,
  onSelect,
  onRestore,
  onPermanentDelete,
  accent,
}: {
  folder: DeletedDrive;
  selected?: boolean;
  onSelect?: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  accent: TrashPageVariant;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`group relative flex flex-col items-center rounded-xl border p-6 transition-colors ${
        selected ? a.card : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      }`}
    >
      {onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
            selected ? a.checkbox : "border-neutral-300 bg-transparent dark:border-neutral-600"
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
      <div className={`mb-3 flex h-16 w-16 items-center justify-center rounded-xl ${a.folderIcon}`}>
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
  accent,
}: {
  file: RecentFile;
  selected?: boolean;
  onSelect?: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  accent: TrashPageVariant;
}) {
  const a = ACCENT[accent];
  const [cardRef, isInView] = useInView<HTMLDivElement>();
  const isMacosPackage = file.assetType === "macos_package" || file.id.startsWith("macos-pkg:");
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb", {
    enabled: !isMacosPackage && isInView,
  });
  const isVideo =
    !isMacosPackage &&
    !isAppleDoubleLeafName(file.name) &&
    (isVideoFile(file.name) || (file.contentType?.startsWith("video/") ?? false));
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isVideo && isInView,
    isVideo,
  });
  const fetchVideoStreamUrl = useBackupVideoStreamUrl();
  const isPdf = isPdfFile(file.name) || file.contentType === "application/pdf";
  const pdfThumbnailUrl = usePdfThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isPdf && isInView,
  });
  const creativeThumb = resolveCreativeProjectTile(recentFileToCreativeThumbnailSource(file));
  const aspectClass = getCardAspectClass("landscape");
  const objectFit = "object-contain";

  return (
    <div
      ref={cardRef}
      className={`group relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border transition-colors ${
        selected ? a.card : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      }`}
    >
      {onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
            selected ? a.checkbox : "border-neutral-300 bg-transparent dark:border-neutral-600"
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
      <div
        className={`relative w-full shrink-0 overflow-hidden bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 ${aspectClass}`}
      >
        {isMacosPackage ? (
          creativeThumb.mode === "branded_project" ? (
            <BrandedProjectTile
              brandId={creativeThumb.brandId}
              tileVariant={creativeThumb.tileVariant}
              fileName={file.name}
              displayLabel={creativeThumb.displayLabel}
              extensionLabel={creativeThumb.extensionLabel}
              size="md"
              className="absolute inset-0"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-amber-50 dark:bg-amber-950/40">
              <Archive className="h-8 w-8 text-amber-800 dark:text-amber-400" />
            </div>
          )
        ) : isVideo && file.objectKey ? (
          <VideoScrubThumbnail
            fetchStreamUrl={() => fetchVideoStreamUrl(file.objectKey)}
            thumbnailUrl={videoThumbnailUrl ?? thumbnailUrl}
            showPlayIcon
            objectFit={objectFit}
            className="absolute inset-0 h-full min-h-0 w-full"
          />
        ) : thumbnailUrl || videoThumbnailUrl || pdfThumbnailUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API, video frame, or PDF first page */}
            <img
              src={videoThumbnailUrl ?? pdfThumbnailUrl ?? thumbnailUrl ?? ""}
              alt=""
              className={`absolute inset-0 h-full w-full ${objectFit}`}
            />
          </>
        ) : isVideo ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="absolute inset-2 max-h-full max-w-full text-neutral-500 dark:text-neutral-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 shadow-lg">
                <Play className="ml-1 h-6 w-6 fill-white text-white" />
              </div>
            </div>
          </div>
        ) : creativeThumb.mode === "branded_project" ? (
          <BrandedProjectTile
            brandId={creativeThumb.brandId}
            tileVariant={creativeThumb.tileVariant}
            fileName={file.name}
            displayLabel={creativeThumb.displayLabel}
            extensionLabel={creativeThumb.extensionLabel}
            size="md"
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileIcon className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 pt-2">
        <h3
          className="mb-1 w-full truncate text-left text-sm font-medium text-neutral-900 dark:text-white"
          title={file.name}
        >
          {file.name}
        </h3>
        <p className="text-left text-xs text-neutral-500 dark:text-neutral-400">
          {formatBytes(file.size)} · {file.driveName}
        </p>
        <p className="mt-0.5 text-left text-xs text-neutral-400 dark:text-neutral-500">
          Deleted {formatDate(file.deletedAt ?? null)}
        </p>
      </div>
    </div>
  );
}

interface TrashPageProps {
  variant?: TrashPageVariant;
}

export default function TrashPage({ variant = "dashboard" }: TrashPageProps) {
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

  const setSelectionFromDrag = useCallback((fileIds: string[], folderIds: string[]) => {
    setSelectedFileIds((prev) => new Set([...prev, ...fileIds]));
    setSelectedFolderIds((prev) => new Set([...prev, ...folderIds]));
  }, []);

  const [dragState, setDragState] = useState<{
    isActive: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const gridSectionRef = useRef<HTMLDivElement | null>(null);
  const lastSelectionRef = useRef<{ files: string; folders: string } | null>(null);
  const selectionUpdateRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-selectable-grid]")) return;
      if ((e.target as HTMLElement).closest("button, a, [role=button]")) return;
      if ((e.target as HTMLElement).closest("[data-selectable-item]")) return;
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
      mousePosRef.current = { x: e.clientX, y: e.clientY };
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
      const folderIds: string[] = [];

      items?.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rectsIntersect(dragRect, rect)) return;
        const type = el.getAttribute("data-item-type");
        const id = el.getAttribute("data-item-id");
        const key = el.getAttribute("data-item-key");
        if (type === "file" && id) fileIds.push(id);
        if (type === "folder" && key) folderIds.push(key);
      });

      const filesKey = [...fileIds].sort().join(",");
      const foldersKey = [...folderIds].sort().join(",");
      if (
        lastSelectionRef.current?.files === filesKey &&
        lastSelectionRef.current?.folders === foldersKey
      ) {
        return;
      }
      lastSelectionRef.current = { files: filesKey, folders: foldersKey };
      setSelectionFromDrag(fileIds, folderIds);
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

  useDragToSelectAutoScroll(gridSectionRef, dragState, mousePosRef);

  const hasSelection = selectedFileIds.size + selectedFolderIds.size > 0;
  const selectedCount = selectedFileIds.size + selectedFolderIds.size;

  const loadDeleted = useCallback(async () => {
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
  }, [fetchDeletedFiles, fetchDeletedDrives]);

  useEffect(() => {
    loadDeleted();
  }, [loadDeleted]);

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
    loadDeleted,
  ]);

  const doBulkPermanentDelete = useCallback(
    async (fileIds: string[], folderIds: string[], options?: { skipConfirm?: boolean }) => {
      if (fileIds.length === 0 && folderIds.length === 0) return;
      if (!options?.skipConfirm) {
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
      }
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
      loadDeleted,
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

  const handleDeleteAll = useCallback(async () => {
    if (deletedFiles.length === 0 && deletedDrives.length === 0) return;
    const total = deletedFiles.length + deletedDrives.length;
    const ok = await confirm({
      message: `Permanently delete all ${total} item${total === 1 ? "" : "s"}? This cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    await doBulkPermanentDelete(
      deletedFiles.map((f) => f.id),
      deletedDrives.map((d) => d.id),
      { skipConfirm: true }
    );
    clearSelection();
  }, [deletedFiles, deletedDrives, doBulkPermanentDelete, clearSelection, confirm]);

  const hasItems = deletedFiles.length > 0 || deletedDrives.length > 0;

  const showDragRect =
    dragState?.isActive &&
    (Math.abs(dragState.currentX - dragState.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(dragState.currentY - dragState.startY) > DRAG_THRESHOLD_PX);

  const a = ACCENT[variant];
  const dragRectEl =
    showDragRect && dragState ? (
      <div
        className={`pointer-events-none fixed z-[9999] border-2 ${a.dragRect}`}
        style={{
          left: Math.min(dragState.startX, dragState.currentX),
          top: Math.min(dragState.startY, dragState.currentY),
          width: Math.abs(dragState.currentX - dragState.startX),
          height: Math.abs(dragState.currentY - dragState.startY),
        }}
      />
    ) : null;

  return (
    <>
      <TopBar title="Deleted" />
      <main className="flex-1 overflow-auto p-6">
        <p className="mb-6 text-neutral-500 dark:text-neutral-400">
          Deleted files and folders are kept for 30 days before permanent
          deletion. Items here still count toward your storage until they are
          permanently deleted—restore them to their original location, or delete
          permanently to free space.
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
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}

        {hasItems && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              {deletedFiles.length + deletedDrives.length} item{(deletedFiles.length + deletedDrives.length) === 1 ? "" : "s"} in trash
            </span>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deletingBulk}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" />
              Delete All
            </button>
          </div>
        )}

        {typeof document !== "undefined" && dragRectEl && createPortal(dragRectEl, document.body)}

        <DashboardRouteFade ready={!loading} srOnlyMessage="Loading trash">
        {hasItems ? (
          <div
            ref={gridSectionRef}
            className={`space-y-8 ${dragState?.isActive ? "select-none" : ""}`}
            data-selectable-grid
            onMouseDown={handleMouseDown}
          >
            {deletedDrives.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Deleted folders
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
                  {deletedDrives.map((folder) => (
                    <div
                      key={folder.id}
                      data-selectable-item
                      data-item-type="folder"
                      data-item-key={folder.id}
                    >
                      <DeletedFolderCard
                        folder={folder}
                        selected={selectedFolderIds.has(folder.id)}
                        onSelect={() => toggleFolderSelection(folder.id)}
                        onRestore={() => handleRestoreDrive(folder.id)}
                        onPermanentDelete={() =>
                          handlePermanentDeleteDrive(folder)
                        }
                        accent={variant}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
            {deletedFiles.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Deleted files
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
                  {deletedFiles.map((file) => (
                    <div
                      key={file.id}
                      data-selectable-item
                      data-item-type="file"
                      data-item-id={file.id}
                    >
                      <DeletedFileCard
                        file={file}
                        selected={selectedFileIds.has(file.id)}
                        onSelect={() => toggleFileSelection(file.id)}
                        onRestore={() => handleRestoreFile(file.id)}
                        onPermanentDelete={() =>
                          handlePermanentDeleteFile(file)
                        }
                        accent={variant}
                      />
                    </div>
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
        </DashboardRouteFade>
      </main>
    </>
  );
}
