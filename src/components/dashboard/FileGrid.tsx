"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, ChevronLeft, Film, Filter, FolderInput, Images, LayoutGrid, List, Send, Share2, Trash2 } from "lucide-react";

const DRAG_THRESHOLD_PX = 5;
const DND_MOVE_TYPE = "application/x-bizzi-move-items";

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}
import FolderCard, { type FolderItem } from "./FolderCard";
import FileCard from "./FileCard";
import FilePreviewModal from "./FilePreviewModal";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { useSubscription } from "@/hooks/useSubscription";
import {
  filterDriveFoldersByPowerUp,
  filterLinkedDrivesByPowerUp,
} from "@/lib/drive-powerup-filter";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useGalleries } from "@/hooks/useGalleries";
import { usePinned, fetchPinnedFiles } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";
import { useSearchParams } from "next/navigation";
import type { LinkedDrive } from "@/types/backup";
import ItemActionsMenu from "./ItemActionsMenu";
import BulkMoveModal from "./BulkMoveModal";
import CreateTransferModal, { type TransferModalFile } from "./CreateTransferModal";
import ShareModal from "./ShareModal";
import FilterSidebar from "@/components/filters/FilterSidebar";
import FilterChips from "@/components/filters/FilterChips";
import { useFilteredFiles } from "@/hooks/useFilteredFiles";
import { useDragToSelectAutoScroll } from "@/hooks/useDragToSelectAutoScroll";

function BulkActionBar({
  selectedFileCount,
  selectedFolderCount,
  onMove,
  onNewTransfer,
  onShare,
  onDelete,
  onClear,
}: {
  selectedFileCount: number;
  selectedFolderCount: number;
  onMove: () => void;
  onNewTransfer: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const total = selectedFileCount + selectedFolderCount;
  const parts: string[] = [];
  if (selectedFileCount > 0) parts.push(`${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`);
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} drive${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;
  const canShare = total >= 1;

  return (
    <div className="fixed bottom-4 left-3 right-3 z-50 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-3 dark:border-neutral-700 dark:bg-neutral-900">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label} selected
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onMove}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <FolderInput className="h-4 w-4" />
          Move
        </button>
        <button
          type="button"
          onClick={onNewTransfer}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-bizzi-blue hover:bg-bizzi-blue/10 dark:text-bizzi-cyan dark:hover:bg-bizzi-cyan/10"
        >
          <Send className="h-4 w-4" />
          New transfer
        </button>
        {canShare && (
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        )}
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

export default function FileGrid() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"recents" | "starred">("recents");
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [currentDrive, setCurrentDrive] = useState<{ id: string; name: string } | null>(null);
  const [currentDrivePath, setCurrentDrivePath] = useState<string>("");
  const [driveFiles, setDriveFiles] = useState<RecentFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const {
    driveFolders,
    recentFiles,
    loading,
    fetchDriveFiles,
    subscribeToDriveFiles,
    fetchFilesByIds,
    deleteFile,
    deleteFiles,
    deleteFolder,
    refetch,
    getFileIdsForBulkShare,
    moveFilesToFolder,
    moveFolderContentsToFolder,
  } = useCloudFiles();
  const { galleries } = useGalleries();
  const { pinnedFolderIds, pinnedFileIds, refetch: refetchPinned } = usePinned();
  const { linkedDrives, storageVersion, creatorRawDriveId } = useBackup();
  const { hasEditor, hasGallerySuite } = useSubscription();
  const { setCurrentDrive: setCurrentFolderDriveId } = useCurrentFolder();
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<{
    isActive: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [pinnedFiles, setPinnedFiles] = useState<RecentFile[]>([]);
  const [pinnedFilesLoading, setPinnedFilesLoading] = useState(false);
  const gridSectionRef = useRef<HTMLDivElement | null>(null);
  const selectionUpdateRef = useRef<number | null>(null);
  const lastSelectionRef = useRef<{ files: string; folders: string } | null>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const { confirm } = useConfirm();
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFolderName, setShareFolderName] = useState("");
  const [shareDriveId, setShareDriveId] = useState<string | null>(null);
  const [shareInitialData, setShareInitialData] = useState<{
    token: string;
    accessLevel: "private" | "public";
    permission: "view" | "edit";
    invitedEmails: string[];
  } | null>(null);
  const [transferInitialFiles, setTransferInitialFiles] = useState<TransferModalFile[]>([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const searchParams = useSearchParams();
  const isBizziCloudBaseDrive = (name: string) =>
    name === "Storage" || name === "RAW" || name === "Gallery Media";
  const {
    files: filteredFiles,
    loading: filtersLoading,
    hasFilters,
    filterState,
    setFilter,
    removeFilterById,
    clearFilters,
    clearFiltersAndKeepDrive,
    activeFilters,
  } = useFilteredFiles({
    driveId: currentDrive?.id ?? null,
    driveIdAsNavigation: isBizziCloudBaseDrive(currentDrive?.name ?? "")
      ? currentDrive?.id ?? null
      : null,
  });
  const visibleLinkedDrives = filterLinkedDrivesByPowerUp(linkedDrives, {
    hasEditor,
    hasGallerySuite,
  });
  const drivesForFilter = visibleLinkedDrives.map((d) => ({ id: d.id, name: d.name }));
  const galleriesForFilter = galleries.map((g) => ({ id: g.id, title: g.title }));
  const galleryTitleById = useMemo(
    () => new Map(galleries.map((g) => [g.id, g.title])),
    [galleries]
  );
  const activeFiltersWithLabels = useMemo(
    () =>
      activeFilters.map((af) =>
        af.id === "gallery" && typeof af.value === "string"
          ? { ...af, label: galleryTitleById.get(af.value) ?? af.label }
          : af
      ),
    [activeFilters, galleryTitleById]
  );

  const isSystemDrive = (d: { name: string; isCreatorRaw?: boolean }) =>
    d.name === "Storage" || d.isCreatorRaw === true || d.name === "Gallery Media";

  // Filter drives by power-up so users only see folders they've purchased
  const visibleDriveFolders = filterDriveFoldersByPowerUp(driveFolders, {
    hasEditor,
    hasGallerySuite,
  });

  const folderItems: FolderItem[] = visibleDriveFolders
    .map((d) => ({
      name: d.name,
      type: "folder" as const,
      key: d.key,
      items: d.items,
      hideShare: false,
      driveId: d.id,
      customIcon: d.isCreatorRaw ? Film : d.name === "Gallery Media" ? Images : undefined,
      preventDelete: isSystemDrive(d),
      preventRename: isSystemDrive(d),
      preventMove: isSystemDrive(d),
      isSystemFolder: isSystemDrive(d),
    }))
    .sort((a, b) => {
      const order = (name: string) =>
        name === "Storage" ? 0 : name === "RAW" ? 1 : name === "Gallery Media" ? 2 : 3;
      return order(a.name) - order(b.name);
    });
  const pinnedFolderItems = folderItems.filter((f) => f.driveId && pinnedFolderIds.has(f.driveId));

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
      setCurrentFolderDriveId(id);
      setCurrentDrive({ id, name });
      setCurrentDrivePath("");
      loadDriveFiles(id);
      setSelectedFileIds(new Set());
      setSelectedFolderKeys(new Set());
      if (isBizziCloudBaseDrive(name)) {
        clearFiltersAndKeepDrive(id);
      }
    },
    [loadDriveFiles, setCurrentFolderDriveId, clearFiltersAndKeepDrive]
  );

  const closeDrive = useCallback(() => {
    setCurrentFolderDriveId(null);
    setCurrentDrive(null);
    setCurrentDrivePath("");
    setDriveFiles([]);
    setSelectedFileIds(new Set());
    setSelectedFolderKeys(new Set());
  }, [setCurrentFolderDriveId]);

  const isGalleryMediaDrive =
    !!currentDrive && linkedDrives.some((d) => d.id === currentDrive.id && d.name === "Gallery Media");

  const { subfolderItems, displayedFiles } = (() => {
    if (!currentDrive || !isGalleryMediaDrive) {
      return { subfolderItems: [] as FolderItem[], displayedFiles: driveFiles };
    }
    const prefix = currentDrivePath ? `${currentDrivePath}/` : "";
    const filesInView = currentDrivePath
      ? driveFiles.filter((f) => f.path.startsWith(prefix))
      : driveFiles;
    if (currentDrivePath) {
      return { subfolderItems: [], displayedFiles: filesInView };
    }
    const galleryTitleMap = new Map(galleries.map((g) => [g.id, g.title]));
    const seen = new Map<string, { count: number; displayName: string }>();
    for (const f of driveFiles) {
      const parts = f.path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const folderKey = f.galleryId ?? parts[0];
        const existing = seen.get(folderKey);
        const displayName =
          f.galleryId && galleryTitleMap.has(f.galleryId)
            ? galleryTitleMap.get(f.galleryId)!
            : folderKey;
        if (existing) {
          seen.set(folderKey, { count: existing.count + 1, displayName: existing.displayName });
        } else {
          seen.set(folderKey, { count: 1, displayName });
        }
      }
    }
    const subfolderItems: FolderItem[] = Array.from(seen.entries()).map(([folderKey, { count, displayName }]) => ({
      name: displayName,
      type: "folder" as const,
      key: `gallery-subfolder-${currentDrive.id}|${folderKey}`,
      items: count,
      driveId: undefined,
      virtualFolder: true,
      hideShare: true,
      preventDelete: true,
      preventRename: true,
      pathPrefix: folderKey,
    }));
    const rootFiles = driveFiles.filter((f) => !f.path.includes("/"));
    return { subfolderItems, displayedFiles: rootFiles };
  })();

  const filesToShow = hasFilters
    ? filteredFiles
    : currentDrive
      ? displayedFiles
      : recentFiles;

  const showFolders = !hasFilters;

  // Refresh drive files when storage changes (e.g. after upload) so UI updates in real time
  useEffect(() => {
    if (currentDrive && storageVersion > 0) {
      loadDriveFiles(currentDrive.id);
    }
  }, [storageVersion, currentDrive, loadDriveFiles]);

  // Real-time subscription: mount uploads appear in web app without refresh
  useEffect(() => {
    if (!currentDrive) {
      setDriveFiles([]);
      return;
    }
    return subscribeToDriveFiles(currentDrive.id, setDriveFiles);
  }, [currentDrive, subscribeToDriveFiles]);

  // Fetch pinned file details when pinned file IDs change
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

  // Open drive from URL query when navigating from Home (e.g. /dashboard/files?drive=id)
  // Only open if drive is in visible set (respects power-up gating)
  useEffect(() => {
    const driveId = searchParams.get("drive");
    if (driveId && !currentDrive) {
      const folder = visibleDriveFolders.find((d) => d.id === driveId);
      if (folder) {
        openDrive(driveId, folder.name);
        if (isBizziCloudBaseDrive(folder.name)) {
          clearFiltersAndKeepDrive(driveId);
        }
      }
    }
  }, [searchParams, currentDrive, visibleDriveFolders, openDrive, clearFiltersAndKeepDrive]);

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

  const currentDriveId = currentDrive?.id;
  const hasSelection = selectedFileIds.size + selectedFolderKeys.size > 0;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!hasSelection) return;
      e.dataTransfer.setData(
        DND_MOVE_TYPE,
        JSON.stringify({
          fileIds: Array.from(selectedFileIds),
          folderKeys: Array.from(selectedFolderKeys),
        })
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [hasSelection, selectedFileIds, selectedFolderKeys]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-selectable-grid]")) return;
      if ((e.target as HTMLElement).closest("button, a, [role=button]")) return;
      // Don't start marquee when mousedown is on an item - that could be drag-to-move
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

  useDragToSelectAutoScroll(gridSectionRef, dragState, mousePosRef);

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
        ? `${folderCount} drive${folderCount === 1 ? "" : "s"} will be moved to trash (or unlinked if empty). `
        : "";
    const ok = await confirm({
      message: `Delete ${total} item${total === 1 ? "" : "s"}? ${fileMsg}${folderMsg}You can restore files from the Deleted files tab.`,
      destructive: true,
    });
    if (!ok) return;

    try {
      let didUnlinkCurrentDrive = false;
      const allFileIdsToDelete = [...fileIds];

      for (const key of folderKeys) {
        if (key.startsWith("gallery-subfolder-")) {
          const rest = key.replace("gallery-subfolder-", "");
          const sep = rest.indexOf("|");
          if (sep >= 0) {
            const subfolderPath = rest.slice(sep + 1);
            const idsInSubfolder = driveFiles
              .filter((f) => f.path === subfolderPath || f.path.startsWith(`${subfolderPath}/`))
              .map((f) => f.id);
            allFileIdsToDelete.push(...idsInSubfolder);
          }
          continue;
        }
        const driveId = key.startsWith("drive-") ? key.slice(6) : key;
        const drive = linkedDrives.find((d) => d.id === driveId);
        const itemCount = folderItems.find((f) => f.key === key)?.items ?? 0;
        if (drive) {
          await deleteFolder(drive, itemCount);
          if (currentDriveId === driveId) {
            closeDrive();
            didUnlinkCurrentDrive = true;
          }
        }
      }

      if (allFileIdsToDelete.length > 0) await deleteFiles(allFileIdsToDelete);
      clearSelection();
      await refetch();
      if (currentDrive && allFileIdsToDelete.length > 0 && !didUnlinkCurrentDrive) {
        loadDriveFiles(currentDrive.id);
      }
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  }, [
    selectedFileIds,
    selectedFolderKeys,
    folderItems,
    driveFiles,
    deleteFiles,
    deleteFolder,
    linkedDrives,
    currentDriveId,
    currentDrive,
    closeDrive,
    clearSelection,
    refetch,
    loadDriveFiles,
    confirm,
  ]);

  const handleBulkMove = useCallback(() => {
    setMoveModalOpen(true);
  }, []);

  const performMove = useCallback(
    async (
      fileIds: string[],
      folderKeys: string[],
      targetDriveId: string
    ) => {
      if (fileIds.length > 0) {
        await moveFilesToFolder(fileIds, targetDriveId);
      }
      for (const key of folderKeys) {
        const driveId = key.startsWith("drive-") ? key.slice(6) : key;
        const drive = linkedDrives.find((d) => d.id === driveId);
        if (drive && driveId !== targetDriveId) {
          await moveFolderContentsToFolder(driveId, targetDriveId);
          if (currentDriveId === driveId) {
            closeDrive();
          }
        }
      }
      clearSelection();
      await refetch();
      if (currentDrive && fileIds.length > 0) {
        loadDriveFiles(currentDrive.id);
      }
    },
    [
      linkedDrives,
      currentDriveId,
      currentDrive,
      closeDrive,
      moveFilesToFolder,
      moveFolderContentsToFolder,
      clearSelection,
      refetch,
      loadDriveFiles,
    ]
  );

  const handleBulkMoveConfirm = useCallback(
    async (targetDriveId: string) => {
      await performMove(
        Array.from(selectedFileIds),
        Array.from(selectedFolderKeys),
        targetDriveId
      );
      setMoveModalOpen(false);
    },
    [selectedFileIds, selectedFolderKeys, performMove]
  );

  const handleDropOnFolder = useCallback(
    async (targetDriveId: string, e: React.DragEvent) => {
      try {
        const raw = e.dataTransfer.getData(DND_MOVE_TYPE);
        if (!raw) return;
        const data = JSON.parse(raw) as { fileIds: string[]; folderKeys: string[] };
        const { fileIds, folderKeys } = data;
        if ((fileIds?.length ?? 0) + (folderKeys?.length ?? 0) === 0) return;
        await performMove(fileIds ?? [], folderKeys ?? [], targetDriveId);
      } catch {
        // ignore parse errors
      }
    },
    [performMove]
  );

  const handleBulkNewTransfer = useCallback(async () => {
    const fileIds = Array.from(selectedFileIds);
    if (fileIds.length > 0) {
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
    } else {
      setTransferInitialFiles([]);
    }
    setTransferModalOpen(true);
  }, [selectedFileIds, fetchFilesByIds]);

  const handleBulkShare = useCallback(async () => {
    const fileIds = Array.from(selectedFileIds);
    const folderKeys = Array.from(selectedFolderKeys);
    const folderDriveIds = folderKeys
      .map((k) => (k.startsWith("drive-") ? k.slice(6) : k))
      .filter(Boolean);
    const folderName = `Share ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;

    try {
      const allFileIds = await getFileIdsForBulkShare(fileIds, folderDriveIds);
      if (allFileIds.length === 0) return;

      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) return;

      const res = await fetch("/api/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          referenced_file_ids: allFileIds,
          folder_name: folderName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create share");
      }

      const data = await res.json();
      setShareFolderName(folderName);
      setShareDriveId(null);
      setShareInitialData({
        token: data.token,
        accessLevel: data.access_level ?? "private",
        permission: data.permission ?? "view",
        invitedEmails: data.invited_emails ?? [],
      });
      setShareModalOpen(true);
      clearSelection();
      await refetch();
      if (currentDrive && fileIds.length > 0) {
        loadDriveFiles(currentDrive.id);
      }
    } catch (err) {
      console.error("Bulk share failed:", err);
    }
  }, [
    selectedFileIds,
    selectedFolderKeys,
    getFileIdsForBulkShare,
    clearSelection,
    refetch,
    currentDrive,
    loadDriveFiles,
  ]);

  return (
    <div
      ref={gridSectionRef}
      className={`mx-auto max-w-6xl ${dragState?.isActive ? "select-none" : ""}`}
      data-selectable-grid
      onMouseDown={handleMouseDown}
    >
      <div className="flex gap-6">
        {/* Filter sidebar */}
        <aside
          className={`${
            filterPanelOpen ? "block" : "hidden"
          } w-60 min-w-0 flex-shrink-0 md:block`}
        >
          <div className="sticky top-24 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Filters
              </h3>
              <button
                type="button"
                onClick={() => setFilterPanelOpen(false)}
                className="md:hidden"
                aria-label="Close filters"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <FilterSidebar
              filterState={filterState}
              setFilter={setFilter}
              drives={drivesForFilter}
              galleries={galleriesForFilter}
              insideFolder={!!currentDrive}
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-8">
      {/* Filter chips + toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterPanelOpen((o) => !o)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              filterPanelOpen || hasFilters
                ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:border-bizzi-cyan dark:bg-bizzi-cyan/10 dark:text-bizzi-cyan"
                : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          {hasFilters && (
            <FilterChips
              activeFilters={activeFiltersWithLabels}
              onRemove={removeFilterById}
              onClearAll={clearFilters}
            />
          )}
        </div>
      </div>

      {/* Breadcrumb when inside a drive */}
      {currentDrive && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={
              currentDrivePath
                ? () => {
                    setCurrentDrivePath("");
                    setSelectedFileIds(new Set());
                  }
                : closeDrive
            }
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-neutral-400 dark:text-neutral-500">/</span>
          <span className="font-medium text-neutral-900 dark:text-white">
            {currentDrive.name}
          </span>
          {currentDrivePath && (
            <>
              <span className="text-neutral-400 dark:text-neutral-500">/</span>
              <span className="font-medium text-neutral-900 dark:text-white">
                {(isGalleryMediaDrive ? galleries.find((g) => g.id === currentDrivePath)?.title : null) ?? currentDrivePath}
              </span>
            </>
          )}
        </div>
      )}

      {/* Pinned shortcuts (only at root) - user-pinned folders and files */}
      {!currentDrive && (pinnedFolderItems.length > 0 || pinnedFileIds.size > 0 || pinnedFilesLoading) && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/50">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Pinned
            </h2>
          </div>
          {pinnedFilesLoading ? (
            <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Loading…
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {pinnedFolderItems.map((item) => {
                const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                const driveId = item.driveId ?? "";
                const isFolderInSelection = selectedFolderKeys.has(item.key);
                const isDropTarget =
                  !!driveId &&
                  hasSelection &&
                  !isFolderInSelection &&
                  linkedDrives.some((d) => d.id === driveId);
                return (
                  <div
                    key={item.key}
                    data-selectable-item
                    data-item-type="folder"
                    data-item-key={item.key}
                    draggable={isFolderInSelection && hasSelection}
                    onDragStart={handleDragStart}
                    className={isFolderInSelection && hasSelection ? "cursor-grab active:cursor-grabbing" : undefined}
                  >
                    <FolderCard
                      item={item}
                      onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                      isDropTarget={isDropTarget}
                      onItemsDropped={handleDropOnFolder}
                      onDelete={
                        drive && !item.preventDelete
                          ? async () => {
                              const msg = item.items === 0
                                ? `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`
                                : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`;
                              const ok = await confirm({ message: msg, destructive: true });
                              if (ok) {
                                await deleteFolder(drive, item.items);
                                await refetch();
                                await refetchPinned();
                              }
                            }
                          : undefined
                      }
                      selectable={!!drive && !item.preventDelete}
                      selected={selectedFolderKeys.has(item.key)}
                      onSelect={() => toggleFolderSelection(item.key)}
                    />
                  </div>
                );
              })}
              {pinnedFiles.map((file) => (
                <div
                  key={file.id}
                  data-selectable-item
                  data-item-type="file"
                  data-item-id={file.id}
                  draggable={selectedFileIds.has(file.id) && hasSelection}
                  onDragStart={handleDragStart}
                  className={selectedFileIds.has(file.id) && hasSelection ? "cursor-grab active:cursor-grabbing" : undefined}
                >
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
          )}
        </section>
      )}

      {/* Recents / Starred tabs + view toggle (only at root, or when in drive show "Files") */}
      <section className="relative rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
        {typeof document !== "undefined" &&
          dragState?.isActive &&
          (Math.abs(dragState.currentX - dragState.startX) > DRAG_THRESHOLD_PX ||
            Math.abs(dragState.currentY - dragState.startY) > DRAG_THRESHOLD_PX) &&
          createPortal(
            <div
              className="pointer-events-none fixed z-[9999] border-2 border-bizzi-blue bg-bizzi-blue/20 shadow-lg shadow-bizzi-blue/30"
              style={{
                left: Math.min(dragState.startX, dragState.currentX),
                top: Math.min(dragState.startY, dragState.currentY),
                width: Math.abs(dragState.currentX - dragState.startX),
                height: Math.abs(dragState.currentY - dragState.startY),
              }}
            />,
            document.body
          )}
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
          <div className="flex items-center gap-2">
            {(hasFilters ? filesToShow.length > 0 : currentDrive ? subfolderItems.length > 0 || displayedFiles.length > 0 : folderItems.length > 0 || recentFiles.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (hasFilters) {
                    setSelectedFileIds(new Set(filesToShow.map((f) => f.id)));
                    setSelectedFolderKeys(new Set());
                  } else if (currentDrive) {
                    setSelectedFileIds(new Set(displayedFiles.map((f) => f.id)));
                    setSelectedFolderKeys(new Set(subfolderItems.map((s) => s.key)));
                  } else {
                    setSelectedFileIds(new Set(recentFiles.map((f) => f.id)));
                    setSelectedFolderKeys(new Set(folderItems.map((f) => f.key)));
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label="Select all"
              >
                <CheckSquare className="h-4 w-4" />
                Select
              </button>
            )}
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
        </div>

        {/* File grid */}
        {hasFilters && filtersLoading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading filtered results…
          </div>
        ) : currentDrive ? (
          driveFilesLoading ? (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Loading files…
            </div>
          ) : hasFilters && filesToShow.length === 0 && !filtersLoading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No files match your filters. Try adjusting or clearing filters.
          </div>
        ) : hasFilters || subfolderItems.length > 0 || displayedFiles.length > 0 ? (
            <div
              data-selectable-grid
              className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            >
              {showFolders && subfolderItems.map((item) => {
                const isFolderInSelection = selectedFolderKeys.has(item.key);
                return (
                  <div
                    key={item.key}
                    data-selectable-item
                    data-item-type="folder"
                    data-item-key={item.key}
                    draggable={isFolderInSelection && hasSelection}
                    onDragStart={handleDragStart}
                    className={isFolderInSelection && hasSelection ? "cursor-grab active:cursor-grabbing" : undefined}
                  >
                    <FolderCard
                      item={item}
                      onClick={() => {
                        setCurrentDrivePath(item.pathPrefix ?? item.name);
                        setSelectedFileIds(new Set());
                        setSelectedFolderKeys(new Set());
                      }}
                      selectable
                      selected={isFolderInSelection}
                      onSelect={() => toggleFolderSelection(item.key)}
                    />
                  </div>
                );
              })}
              {filesToShow.map((file) => (
                <div
                  key={file.id}
                  data-selectable-item
                  data-item-type="file"
                  data-item-id={file.id}
                  draggable={selectedFileIds.has(file.id) && hasSelection}
                  onDragStart={handleDragStart}
                  className={selectedFileIds.has(file.id) && hasSelection ? "cursor-grab active:cursor-grabbing" : undefined}
                >
                  <FileCard
                    file={file}
                    onClick={() => setPreviewFile(file)}
                    onDelete={async () => {
                      await deleteFile(file.id);
                      if (currentDrive) loadDriveFiles(currentDrive.id);
                    }}
                    selectable
                    selected={selectedFileIds.has(file.id)}
                    onSelect={() => toggleFileSelection(file.id)}
                    onAfterRename={() => currentDrive && loadDriveFiles(currentDrive.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {isGalleryMediaDrive
                ? "No gallery media yet. Upload photos in a gallery to see them organized by gallery here."
                : "No files in this drive yet. Sync to add files."}
            </div>
          )
        ) : loading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading your files…
          </div>
        ) : activeTab === "recents" ? (
          <>
            {showFolders && folderItems.length > 0 && (
              <>
                <h3 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Your synced drives
                </h3>
                <div
                  data-selectable-grid
                  className="mb-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {folderItems.map((item) => {
                    const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                    const driveId = drive?.id;
                    const isFolderInSelection = selectedFolderKeys.has(item.key);
                    const isDropTarget =
                      !!driveId &&
                      hasSelection &&
                      !isFolderInSelection &&
                      linkedDrives.some((d) => d.id === driveId);
                    return (
                      <div
                        key={item.key}
                        data-selectable-item
                        data-item-type="folder"
                        data-item-key={item.key}
                        draggable={isFolderInSelection && hasSelection}
                        onDragStart={handleDragStart}
                        className={isFolderInSelection && hasSelection ? "cursor-grab active:cursor-grabbing" : undefined}
                      >
                        <FolderCard
                          item={item}
                          onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                          isDropTarget={isDropTarget}
                          onItemsDropped={handleDropOnFolder}
                          onDelete={
                            drive && !item.preventDelete
                              ? async () => {
                                  const msg = item.items === 0
                                    ? `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`
                                    : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`;
                                  const ok = await confirm({ message: msg, destructive: true });
                                  if (ok) {
                                    await deleteFolder(drive, item.items);
                                    if (currentDriveId === driveId) closeDrive();
                                    await refetch();
                                  }
                                }
                              : undefined
                          }
                          selectable={!!drive && !item.preventDelete}
                          selected={selectedFolderKeys.has(item.key)}
                          onSelect={() => toggleFolderSelection(item.key)}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {filesToShow.length > 0 && (
              <>
                <h3 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Recently synced files
                </h3>
                <div
                  data-selectable-grid
                  className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {filesToShow.map((file) => (
                    <div
                      key={file.id}
                      data-selectable-item
                      data-item-type="file"
                      data-item-id={file.id}
                      draggable={selectedFileIds.has(file.id) && hasSelection}
                      onDragStart={handleDragStart}
                      className={selectedFileIds.has(file.id) && hasSelection ? "cursor-grab active:cursor-grabbing" : undefined}
                    >
                      <FileCard
                        file={file}
                        onClick={() => setPreviewFile(file)}
                        onDelete={async () => {
                          await deleteFile(file.id);
                        }}
                        selectable
                        selected={selectedFileIds.has(file.id)}
                        onSelect={() => toggleFileSelection(file.id)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
            {!loading && !hasFilters && folderItems.length === 0 && filesToShow.length === 0 && (
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
        </div>
      </div>

      {selectedFileIds.size + selectedFolderKeys.size > 0 && (
        <BulkActionBar
          selectedFileCount={selectedFileIds.size}
          selectedFolderCount={selectedFolderKeys.size}
          onMove={handleBulkMove}
          onNewTransfer={handleBulkNewTransfer}
          onShare={handleBulkShare}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}

      <BulkMoveModal
        open={moveModalOpen}
        onClose={() => setMoveModalOpen(false)}
        selectedFileCount={selectedFileIds.size}
        selectedFolderCount={selectedFolderKeys.size}
        excludeDriveIds={[
          ...(currentDriveId ? [currentDriveId] : []),
          ...Array.from(selectedFolderKeys).map((k) => (k.startsWith("drive-") ? k.slice(6) : k)),
        ]}
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

      {shareModalOpen && (
        <ShareModal
          open={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setShareDriveId(null);
            setShareInitialData(null);
          }}
          folderName={shareFolderName}
          linkedDriveId={shareDriveId ?? undefined}
          initialShareToken={shareInitialData?.token}
          initialAccessLevel={shareInitialData?.accessLevel}
          initialPermission={shareInitialData?.permission}
          initialInvitedEmails={shareInitialData?.invitedEmails}
        />
      )}

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        showLUTForVideo={previewFile?.driveId === creatorRawDriveId}
      />
    </div>
  );
}
