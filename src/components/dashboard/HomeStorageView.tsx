"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Download, Film, FolderInput, Images, Loader2, Send, Share2, Trash2 } from "lucide-react";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import {
  filterDriveFoldersByPowerUp,
  filterLinkedDrivesByPowerUp,
} from "@/lib/drive-powerup-filter";
import { usePinned, fetchPinnedFiles } from "@/hooks/usePinned";
import { useBulkDownload } from "@/hooks/useBulkDownload";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { useBackup } from "@/context/BackupContext";
import FolderCard, { type FolderItem } from "./FolderCard";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FolderListRow from "./FolderListRow";
import FilePreviewModal from "./FilePreviewModal";
import BulkMoveModal from "./BulkMoveModal";
import CreateTransferModal, { type TransferModalFile } from "./CreateTransferModal";
import ShareModal from "./ShareModal";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";
import { useDragToSelectAutoScroll } from "@/hooks/useDragToSelectAutoScroll";
import SectionTitle from "./SectionTitle";
import DashboardRouteFade from "./DashboardRouteFade";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";
import { recordRecentOpen } from "@/hooks/useRecentOpens";
import { getAuthToken, getCurrentUserIdToken } from "@/lib/auth-token";
import { useAuth } from "@/context/AuthContext";
import { isMacosPackageFileRow } from "@/lib/macos-package-display";

const DRAG_THRESHOLD_PX = 5;

import { getDragMovePayload, getMovePayloadFromDragSource, setDragMovePayload } from "@/lib/dnd-move-items";
import { rectsIntersect } from "@/lib/utils";

function BulkActionBar({
  selectedFileCount,
  selectedFolderCount,
  onMove,
  onNewTransfer,
  onShare,
  onDownload,
  isDownloading,
  onDelete,
  onClear,
}: {
  selectedFileCount: number;
  selectedFolderCount: number;
  onMove: () => void;
  onNewTransfer: () => void;
  onShare: () => void;
  onDownload?: () => void;
  isDownloading?: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  const total = selectedFileCount + selectedFolderCount;
  const parts: string[] = [];
  if (selectedFileCount > 0) parts.push(`${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`);
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;
  const canShare = total >= 1;
  const showDownload = selectedFileCount >= 1;
  const downloadDisabled = selectedFileCount > 50 || isDownloading;
  const downloadTitle = selectedFileCount > 50 ? "Download supports up to 50 files at once" : undefined;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label} selected
      </span>
      <div className="flex items-center gap-2">
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
        {showDownload && onDownload && (
          <button
            type="button"
            onClick={onDownload}
            disabled={downloadDisabled}
            title={downloadTitle}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
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

interface HomeStorageViewProps {
  /** Base path for links: "/dashboard" or "/enterprise" */
  basePath?: string;
}

export default function HomeStorageView({ basePath = "/dashboard" }: HomeStorageViewProps) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    driveFolders,
    loading,
    authQuotaExceeded,
    recentUploads,
    fetchRecentUploads,
    deleteFile,
    deleteFiles,
    deleteFolder,
    refetch,
    fetchFilesByIds,
    getFileIdsForBulkShare,
    moveFilesToFolder,
    moveFolderContentsToFolder,
  } = useCloudFiles();
  const { pinnedFolderIds, pinnedFileIds, loading: pinnedLoading, refetch: refetchPinned } = usePinned();
  const { planId, loading: subscriptionLoading } = useSubscription();
  const { hasEditor, hasGallerySuite, loading: powerUpContextLoading } = useEffectivePowerUps();
  const {
    linkedDrives,
    storageVersion,
    getOrCreateStorageDrive,
    getOrCreateCreatorRawDrive,
    getOrCreateGalleryDrive,
    loading: backupDrivesLoading,
    creatorRawDriveId,
  } = useBackup();
  const { setCurrentDrive: setCurrentFolderDriveId, setCurrentDrivePath } = useCurrentFolder();
  const {
    viewMode,
    cardSize,
    aspectRatio,
    thumbnailScale,
    showCardInfo,
  } = useLayoutSettings();
  const [pinnedFiles, setPinnedFiles] = useState<RecentFile[]>([]);
  const [pinnedFilesLoading, setPinnedFilesLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [packageInfoId, setPackageInfoId] = useState<string | null>(null);
  const [packageInfoJson, setPackageInfoJson] = useState<Record<string, unknown> | null>(null);
  const [packageInfoLoading, setPackageInfoLoading] = useState(false);
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
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const { confirm } = useConfirm();
  const { downloadMacosPackageZip } = useBulkDownload({ fetchFilesByIds });
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!moveNotice) return;
    const t = window.setTimeout(() => setMoveNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [moveNotice]);
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

  const filesHref = `${basePath}/files`;
  const isEnterpriseHome = basePath === "/enterprise";
  const totalItems = driveFolders.reduce((sum, d) => sum + d.items, 0);

  const teamAwareBaseName = (name: string) => name.replace(/^\[Team\]\s+/, "");
  const isStorageDrive = (d: { name: string }) => teamAwareBaseName(d.name) === "Storage";
  const isRawDrive = (d: { isCreatorRaw?: boolean }) => d.isCreatorRaw === true;
  const isGalleryMediaDrive = (d: { name: string }) => teamAwareBaseName(d.name) === "Gallery Media";
  const isSystemDrive = (d: { name: string; isCreatorRaw?: boolean }) =>
    isStorageDrive(d) || isRawDrive(d) || isGalleryMediaDrive(d);

  const folderItems: FolderItem[] = driveFolders
    .map((d) => ({
      name: d.name,
      type: "folder" as const,
      key: d.key,
      items: d.items,
      hideShare: false,
      driveId: d.id,
      customIcon: d.isCreatorRaw ? Film : isGalleryMediaDrive(d) ? Images : undefined,
      preventDelete: isSystemDrive(d),
      preventRename: isSystemDrive(d),
      preventMove: isSystemDrive(d),
      isSystemFolder: isSystemDrive(d),
    }))
    .sort((a, b) => {
      const order = (name: string) => {
        const base = teamAwareBaseName(name);
        return base === "Storage" ? 0 : base === "RAW" ? 1 : base === "Gallery Media" ? 2 : 3;
      };
      return order(a.name) - order(b.name);
    });

  // Filter system drives (Storage, RAW, Gallery Media) by power-up - only show what user has purchased
  const visibleSystemDrives = filterDriveFoldersByPowerUp(driveFolders, {
    hasEditor,
    hasGallerySuite,
  });
  const baseFolderItems = folderItems.filter((f) => {
    const drive = visibleSystemDrives.find((d) => d.id === f.driveId);
    return drive ? isSystemDrive(drive) : false;
  });
  const driveFolderItems = folderItems.filter((f) => {
    const drive = driveFolders.find((d) => d.id === f.driveId);
    return drive ? !isSystemDrive(drive) : false;
  });
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

  const syncPinsAfterFileMutate = useCallback(() => {
    void refetchPinned();
    void loadPinnedFiles();
  }, [refetchPinned, loadPinnedFiles]);

  useEffect(() => {
    loadPinnedFiles();
  }, [loadPinnedFiles]);

  // Open file preview when navigating from notification (e.g. /dashboard?file=xxx)
  const fileIdFromUrl = searchParams.get("file");
  useEffect(() => {
    if (!fileIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getCurrentUserIdToken(false);
        if (!token || cancelled) return;
        const res = await fetch(`/api/files/${encodeURIComponent(fileIdFromUrl)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as RecentFile;
        if (!cancelled && data?.id) setPreviewFile(data);
        const url = new URL(window.location.href);
        url.searchParams.delete("file");
        const target = url.pathname + url.search + url.hash;
        if (target !== window.location.pathname + window.location.search + window.location.hash) {
          router.replace(target, { scroll: false });
        }
      } catch (e) {
        console.error("Failed to load shared file from URL:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileIdFromUrl, router]);

  useEffect(() => {
    if (!packageInfoId) {
      setPackageInfoJson(null);
      setPackageInfoLoading(false);
      return;
    }
    let cancelled = false;
    setPackageInfoLoading(true);
    setPackageInfoJson(null);
    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          if (!cancelled) setPackageInfoJson({ error: "Not signed in" });
          return;
        }
        const res = await fetch(`/api/packages/${encodeURIComponent(packageInfoId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!cancelled) {
          setPackageInfoJson(
            res.ok ? data : { error: (data.error as string) ?? res.statusText ?? "Error" }
          );
        }
      } catch {
        if (!cancelled) setPackageInfoJson({ error: "Failed to load package info" });
      } finally {
        if (!cancelled) setPackageInfoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packageInfoId]);

  // Load recent uploads (Storage files from past 7 days) on mount and when storage changes
  useEffect(() => {
    if (
      linkedDrives.some((d) => {
        const n = d.name.replace(/^\[Team\]\s+/, "");
        return n === "Storage" || n === "Uploads";
      })
    ) {
      fetchRecentUploads();
    }
  }, [fetchRecentUploads, storageVersion, linkedDrives]);

  // Ensure Storage, RAW, and Gallery Media folders exist for subscribed (paid) users.
  // Personal: create Storage/RAW/Gallery Media based on plan and power-ups.
  // Enterprise: create Gallery Media when org has Gallery Suite/Full Frame and it's missing
  // (Storage/RAW are created by ensure-drives API).
  useEffect(() => {
    const isPersonalHome = basePath === "/dashboard" || basePath.startsWith("/team/");
    const teamOwnerFromPath =
      basePath.startsWith("/team/") ? basePath.replace(/^\/team\//, "").split("/")[0] : null;
    const skipEnsureForTeamMember =
      Boolean(teamOwnerFromPath && user?.uid && teamOwnerFromPath !== user.uid);

    if (
      loading ||
      subscriptionLoading ||
      powerUpContextLoading ||
      !getOrCreateGalleryDrive ||
      (!getOrCreateStorageDrive && isPersonalHome && !skipEnsureForTeamMember) ||
      (!getOrCreateCreatorRawDrive && isPersonalHome && !skipEnsureForTeamMember)
    )
      return;
    const hasStorage = driveFolders.some((d) => teamAwareBaseName(d.name) === "Storage");
    const hasRaw = driveFolders.some((d) => d.isCreatorRaw);
    const hasGalleryMedia = driveFolders.some((d) => teamAwareBaseName(d.name) === "Gallery Media");
    const needsGalleryMedia = !hasGalleryMedia && hasGallerySuite;

    if (basePath === "/enterprise") {
      // Enterprise: only ensure Gallery Media when org has power-up
      if (!needsGalleryMedia) return;
    } else {
      // Personal: full logic; skip for free plan
      if (planId === "free") return;
      const needsRaw = !hasRaw && hasEditor;
      if (hasStorage && !needsRaw && !needsGalleryMedia) return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (isPersonalHome && !skipEnsureForTeamMember) {
          if (!hasStorage && getOrCreateStorageDrive) await getOrCreateStorageDrive();
          if (!cancelled && !hasRaw && hasEditor && getOrCreateCreatorRawDrive)
            await getOrCreateCreatorRawDrive();
        }
        if (!cancelled && needsGalleryMedia) await getOrCreateGalleryDrive();
        if (!cancelled) refetch();
      } catch (e) {
        console.error("Ensure default folders:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    basePath,
    user?.uid,
    loading,
    subscriptionLoading,
    powerUpContextLoading,
    planId,
    hasEditor,
    hasGallerySuite,
    driveFolders,
    getOrCreateStorageDrive,
    getOrCreateCreatorRawDrive,
    getOrCreateGalleryDrive,
    refetch,
  ]);

  const openDrive = useCallback(
    (driveId: string, name: string, pathInsideDrive = "") => {
      recordRecentOpen("folder", driveId, getAuthToken);
      setCurrentFolderDriveId(driveId);
      setCurrentDrivePath(pathInsideDrive.replace(/^\/+/, ""));
      router.push(`${filesHref}?drive=${driveId}`);
    },
    [filesHref, setCurrentFolderDriveId, setCurrentDrivePath, router]
  );

  const openMacosPackageInfo = useCallback((file: RecentFile) => {
    if (!file.macosPackageId) return;
    setPackageInfoId(file.macosPackageId);
  }, []);

  const navigateIntoMacosPackage = useCallback(
    (file: RecentFile) => {
      if (!file.driveId || !isMacosPackageFileRow(file)) return;
      const folder = linkedDrives.find((d) => d.id === file.driveId);
      const name = folder?.name ?? file.driveName ?? "Folder";
      const pathInside = file.path.replace(/^\/+/, "");
      openDrive(file.driveId, name, pathInside);
    },
    [linkedDrives, openDrive]
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
    setSelectedFileIds((prev) => new Set([...prev, ...fileIds]));
    setSelectedFolderKeys((prev) => new Set([...prev, ...folderKeys]));
  }, []);

  const lastSelectionRef = useRef<{ files: string; folders: string } | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const payload = getMovePayloadFromDragSource(
        e.currentTarget as HTMLElement,
        selectedFileIds,
        selectedFolderKeys
      );
      if (!payload || payload.fileIds.length + payload.folderKeys.length === 0) {
        e.preventDefault();
        return;
      }
      setDragMovePayload(e.dataTransfer, payload);
      e.dataTransfer.effectAllowed = "move";
    },
    [selectedFileIds, selectedFolderKeys]
  );

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
      if (folderKeys.length > 0) await refetch();
      await refetchPinned();
      void loadPinnedFiles();
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
        }
      }
      clearSelection();
      await refetch();
      await refetchPinned();
      loadPinnedFiles();
      fetchRecentUploads();
      const destName = linkedDrives.find((d) => d.id === targetDriveId)?.name ?? "folder";
      setMoveNotice(`Items moved into the "${destName}" folder`);
    },
    [
      linkedDrives,
      moveFilesToFolder,
      moveFolderContentsToFolder,
      clearSelection,
      refetch,
      refetchPinned,
      loadPinnedFiles,
      fetchRecentUploads,
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
      const parsed = getDragMovePayload(e.dataTransfer);
      if (!parsed) return;
      await performMove(parsed.fileIds, parsed.folderKeys, targetDriveId);
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

    try {
      const allFileIds = await getFileIdsForBulkShare(fileIds, folderDriveIds);
      if (allFileIds.length === 0) return;

      const defaultFolderName = `Share ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;
      setShareFolderName(defaultFolderName);
      setShareReferencedFileIds(allFileIds);
      setShareDriveId(null);
      setShareInitialData(null);
      setShareModalOpen(true);
      clearSelection();
      await refetch();
      await refetchPinned();
      loadPinnedFiles();
    } catch (err) {
      console.error("Bulk share failed:", err);
    }
  }, [
    selectedFileIds,
    selectedFolderKeys,
    getFileIdsForBulkShare,
    clearSelection,
    refetch,
    refetchPinned,
    loadPinnedFiles,
  ]);

  const hasPinned = pinnedFolderItems.length > 0 || pinnedFileIds.size > 0;
  const pinnedContentReady =
    !pinnedLoading && (pinnedFileIds.size === 0 || !pinnedFilesLoading);
  // Enterprise org add-ons come from `useEffectivePowerUps`, not the signed-in user's personal subscription.
  // Waiting on personal `subscriptionLoading` only delayed the folder grid without benefit.
  // Align folder fade with linked_drives resolution (same idea as team: no empty grid before drives exist).
  const homeViewReady =
    !loading &&
    !powerUpContextLoading &&
    pinnedContentReady &&
    (isEnterpriseHome ? !backupDrivesLoading : !subscriptionLoading);

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
      className={`w-full space-y-0 ${dragState?.isActive ? "select-none" : ""}`}
      data-selectable-grid
      onMouseDown={handleMouseDown}
    >
      {typeof document !== "undefined" && dragRectEl && createPortal(dragRectEl, document.body)}
      <DashboardRouteFade
        ready={homeViewReady}
        srOnlyMessage="Loading your folders and subscription"
      >
      <div className="space-y-0">
      {authQuotaExceeded ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="font-medium">Temporarily can’t refresh cloud data</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
            Firebase sign-in hit a short-term rate limit (often after many uploads or on busy networks). Wait a minute,
            refresh the page, or try another network. Your files are not lost.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 text-sm font-medium text-amber-900 underline hover:no-underline dark:text-amber-100"
          >
            Try again
          </button>
        </div>
      ) : null}
      {/* Section 1: Bizzi Cloud Base (Storage + RAW only) */}
      <section className="border-b border-neutral-200/60 py-6 last:border-b-0 dark:border-neutral-800/60">
        <SectionTitle className="mb-4">Bizzi Cloud Base</SectionTitle>
        {baseFolderItems.length > 0 ? (
          <div
            className="flex justify-center w-full max-w-4xl mx-auto"
            style={{ ["--folder-count" as string]: baseFolderItems.length }}
          >
            <div className="grid grid-cols-1 gap-4 max-w-full sm:grid-cols-[repeat(var(--folder-count),minmax(260px,320px))]">
            {baseFolderItems.map((item) => {
              const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
              const driveId = item.driveId ?? "";
              const isFolderInSelection = selectedFolderKeys.has(item.key);
              const isDropTarget =
                !!driveId &&
                !isFolderInSelection &&
                linkedDrives.some((d) => d.id === driveId);
              const canDragFolder = !!item.driveId && !item.preventMove;
              return (
                <div
                  key={item.key}
                  data-selectable-item
                  data-item-type="folder"
                  data-item-key={item.key}
                  draggable={canDragFolder}
                  onDragStart={handleDragStart}
                  className={canDragFolder ? "cursor-grab active:cursor-grabbing" : undefined}
                >
                  <FolderCard
                    item={item}
                    isDropTarget={isDropTarget}
                    onItemsDropped={handleDropOnFolder}
                    onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                    layoutSize="large"
                    layoutAspectRatio="video"
                    showCardInfo={true}
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
          </div>
        ) : (
          <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
            Your Bizzi Cloud Base folders will appear here based on your plan and power-ups.
          </p>
        )}
      </section>

      {/* Section 2: Pinned */}
      <section className="border-b border-neutral-200/60 py-6 last:border-b-0 dark:border-neutral-800/60">
        <SectionTitle className="mb-4">Pinned</SectionTitle>
        {hasPinned ? (
          viewMode === "list" ? (
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
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
                <tbody data-selectable-grid>
                  {pinnedFolderItems.map((item) => {
                    const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                    const driveId = item.driveId ?? "";
                    const isFolderInSelection = selectedFolderKeys.has(item.key);
                    const isDropTarget =
                      !!driveId &&
                      !isFolderInSelection &&
                      linkedDrives.some((d) => d.id === driveId);
                    const canDragFolder = !!item.driveId && !item.preventMove;
                    return (
                      <FolderListRow
                        key={item.key}
                        item={item}
                        onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                        onDelete={
                          drive && !item.preventDelete
                            ? async () => {
                                const ok = await confirm({
                                  message: item.items === 0
                                    ? `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`
                                    : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`,
                                  destructive: true,
                                });
                                if (ok) {
                                  await deleteFolder(drive, item.items);
                                  await refetch();
                                  await refetchPinned();
                                  loadPinnedFiles();
                                }
                              }
                            : undefined
                        }
                        selectable={!!drive && !item.preventDelete}
                        selected={selectedFolderKeys.has(item.key)}
                        onSelect={() => toggleFolderSelection(item.key)}
                        isDropTarget={isDropTarget}
                        onItemsDropped={handleDropOnFolder}
                        draggable={canDragFolder}
                        onDragStart={handleDragStart}
                      />
                    );
                  })}
                  {pinnedFiles.map((file) => {
                    const isPkg = isMacosPackageFileRow(file);
                    return (
                      <FileListRow
                        key={file.id}
                        file={file}
                        onClick={() => (isPkg ? openMacosPackageInfo(file) : setPreviewFile(file))}
                        onDelete={async () => {
                          await deleteFile(file.id);
                          syncPinsAfterFileMutate();
                        }}
                        onDownloadPackage={
                          isPkg && file.macosPackageId
                            ? () => downloadMacosPackageZip(file.macosPackageId!)
                            : undefined
                        }
                        onPackageInfo={isPkg ? () => openMacosPackageInfo(file) : undefined}
                        selectable
                        selected={selectedFileIds.has(file.id)}
                        onSelect={() => toggleFileSelection(file.id)}
                        draggable={!!file.driveId}
                        onDragStart={handleDragStart}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
          <div
            className={`grid gap-4 ${
              viewMode === "thumbnail"
                ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                : cardSize === "small"
                  ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                  : cardSize === "large"
                    ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
                    : "sm:grid-cols-3 md:grid-cols-4"
            }`}
          >
            {pinnedFolderItems.map((item) => {
                const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                const driveId = item.driveId ?? "";
                const isFolderInSelection = selectedFolderKeys.has(item.key);
                const isDropTarget =
                  !!driveId &&
                  !isFolderInSelection &&
                  linkedDrives.some((d) => d.id === driveId);
                const canDragFolder = !!item.driveId && !item.preventMove;
                return (
                  <div
                    key={item.key}
                    data-selectable-item
                    data-item-type="folder"
                    data-item-key={item.key}
                    draggable={canDragFolder}
                    onDragStart={handleDragStart}
                    className={canDragFolder ? "cursor-grab active:cursor-grabbing" : undefined}
                  >
                    <FolderCard
                      item={item}
                      isDropTarget={isDropTarget}
                      onItemsDropped={handleDropOnFolder}
                      onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                      layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                      layoutAspectRatio={aspectRatio}
                      showCardInfo={showCardInfo}
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
                                loadPinnedFiles();
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
              {pinnedFiles.map((file) => {
                const isPkg = isMacosPackageFileRow(file);
                return (
                  <div
                    key={file.id}
                    data-selectable-item
                    data-item-type="file"
                    data-item-id={file.id}
                    draggable={!!file.driveId}
                    onDragStart={handleDragStart}
                    className={`h-full min-h-0${!!file.driveId ? " cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <FileCard
                      file={file}
                      onClick={() => (isPkg ? openMacosPackageInfo(file) : setPreviewFile(file))}
                      onDelete={async () => {
                        await deleteFile(file.id);
                        syncPinsAfterFileMutate();
                      }}
                      onDownloadPackage={
                        isPkg && file.macosPackageId
                          ? () => downloadMacosPackageZip(file.macosPackageId!)
                          : undefined
                      }
                      onPackageInfo={isPkg ? () => openMacosPackageInfo(file) : undefined}
                      onMacosPackageNavigate={
                        isPkg ? () => navigateIntoMacosPackage(file) : undefined
                      }
                      selectable
                      selected={selectedFileIds.has(file.id)}
                      onSelect={() => toggleFileSelection(file.id)}
                      layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                      layoutAspectRatio={aspectRatio}
                      thumbnailScale={thumbnailScale}
                      showCardInfo={showCardInfo}
                    />
                  </div>
                );
              })}
            </div>
          )
          ) : (
            <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
              Pin files or folders from the All Files tab for quick access.
            </p>
          )}
      </section>

      {/* Section 3: Bizzi Cloud Folders (folders first, then Recent Uploads) */}
      <section className="border-b border-neutral-200/60 py-6 last:border-b-0 dark:border-neutral-800/60">
        <SectionTitle className="mb-4">Bizzi Cloud Folders</SectionTitle>
        {driveFolderItems.length > 0 ? (
          viewMode === "list" ? (
            <div className="mb-6 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
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
                <tbody data-selectable-grid>
                  {driveFolderItems.map((item) => {
                    const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                    const driveId = item.driveId ?? "";
                    const isFolderInSelection = selectedFolderKeys.has(item.key);
                    const isDropTarget =
                      !!driveId &&
                      !isFolderInSelection &&
                      linkedDrives.some((d) => d.id === driveId);
                    const canDragFolder = !!item.driveId && !item.preventMove;
                    return (
                      <FolderListRow
                        key={item.key}
                        item={item}
                        onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                        onDelete={
                          drive && !item.preventDelete
                            ? async () => {
                                const ok = await confirm({
                                  message: item.items === 0
                                    ? `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`
                                    : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`,
                                  destructive: true,
                                });
                                if (ok) {
                                  await deleteFolder(drive, item.items);
                                  await refetch();
                                }
                              }
                            : undefined
                        }
                        selectable={!!drive && !item.preventDelete}
                        selected={selectedFolderKeys.has(item.key)}
                        onSelect={() => toggleFolderSelection(item.key)}
                        isDropTarget={isDropTarget}
                        onItemsDropped={handleDropOnFolder}
                        draggable={canDragFolder}
                        onDragStart={handleDragStart}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
          <div
            className={`mb-6 grid gap-4 ${
              viewMode === "thumbnail"
                ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                : cardSize === "small"
                  ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                  : cardSize === "large"
                    ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
                    : "sm:grid-cols-3 md:grid-cols-4"
            }`}
          >
            {driveFolderItems.map((item) => {
              const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
              const driveId = item.driveId ?? "";
              const isFolderInSelection = selectedFolderKeys.has(item.key);
              const isDropTarget =
                !!driveId &&
                !isFolderInSelection &&
                linkedDrives.some((d) => d.id === driveId);
              const canDragFolder = !!item.driveId && !item.preventMove;
              return (
                <div
                  key={item.key}
                  data-selectable-item
                  data-item-type="folder"
                  data-item-key={item.key}
                  draggable={canDragFolder}
                  onDragStart={handleDragStart}
                  className={canDragFolder ? "cursor-grab active:cursor-grabbing" : undefined}
                >
                  <FolderCard
                    item={item}
                    isDropTarget={isDropTarget}
                    onItemsDropped={handleDropOnFolder}
                    onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                    layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                    layoutAspectRatio={aspectRatio}
                    showCardInfo={showCardInfo}
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
          )
        ) : (
          <p className="mb-6 py-4 text-sm text-neutral-500 dark:text-neutral-400">
            Newly created folders will appear here.
          </p>
        )}
        {(visibleSystemDrives.some((d) => teamAwareBaseName(d.name) === "Storage") ||
          linkedDrives.some((d) => teamAwareBaseName(d.name) === "Storage")) && (
          <>
            <SectionTitle as="h3" className="mb-3 text-xs font-medium">
              Recent Uploads
            </SectionTitle>
            {recentUploads.length > 0 ? (
              viewMode === "list" ? (
                <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
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
                    <tbody data-selectable-grid>
                      {recentUploads.map((file) => {
                        const isPkg = isMacosPackageFileRow(file);
                        return (
                          <FileListRow
                            key={file.id}
                            file={file}
                            onClick={() => (isPkg ? openMacosPackageInfo(file) : setPreviewFile(file))}
                            onDelete={async () => {
                              await deleteFile(file.id);
                              syncPinsAfterFileMutate();
                            }}
                            onDownloadPackage={
                              isPkg && file.macosPackageId
                                ? () => downloadMacosPackageZip(file.macosPackageId!)
                                : undefined
                            }
                            onPackageInfo={isPkg ? () => openMacosPackageInfo(file) : undefined}
                            selectable
                            selected={selectedFileIds.has(file.id)}
                            onSelect={() => toggleFileSelection(file.id)}
                            draggable={!!file.driveId}
                            onDragStart={handleDragStart}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
              <div
                className={`grid gap-4 ${
                  viewMode === "thumbnail"
                    ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                    : cardSize === "small"
                      ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                      : cardSize === "large"
                        ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
                        : "sm:grid-cols-3 md:grid-cols-4"
                }`}
              >
                {recentUploads.map((file) => {
                  const isPkg = isMacosPackageFileRow(file);
                  return (
                    <div
                      key={file.id}
                      data-selectable-item
                      data-item-type="file"
                      data-item-id={file.id}
                      draggable={!!file.driveId}
                      onDragStart={handleDragStart}
                      className={`h-full min-h-0${!!file.driveId ? " cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <FileCard
                        file={file}
                        onClick={() => (isPkg ? openMacosPackageInfo(file) : setPreviewFile(file))}
                        onDelete={async () => {
                          await deleteFile(file.id);
                          syncPinsAfterFileMutate();
                        }}
                        onDownloadPackage={
                          isPkg && file.macosPackageId
                            ? () => downloadMacosPackageZip(file.macosPackageId!)
                            : undefined
                        }
                        onPackageInfo={isPkg ? () => openMacosPackageInfo(file) : undefined}
                        onMacosPackageNavigate={
                          isPkg ? () => navigateIntoMacosPackage(file) : undefined
                        }
                        selectable
                        selected={selectedFileIds.has(file.id)}
                        onSelect={() => toggleFileSelection(file.id)}
                        layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                        layoutAspectRatio={aspectRatio}
                        thumbnailScale={thumbnailScale}
                        showCardInfo={showCardInfo}
                      />
                    </div>
                  );
                })}
              </div>
              )
            ) : (
              <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
                Files uploaded to Storage in the past 7 days will appear here. (Upload time counts, not camera file dates.)
              </p>
            )}
          </>
        )}
      </section>
      </div>
      </DashboardRouteFade>

      {moveNotice ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[45] flex max-w-[min(92vw,24rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-lg dark:border-emerald-800/60 dark:bg-emerald-950/90 dark:text-emerald-100"
        >
          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
          <span className="text-left">{moveNotice}</span>
        </div>
      ) : null}

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
        excludeDriveIds={Array.from(selectedFolderKeys).map((k) =>
          k.startsWith("drive-") ? k.slice(6) : k
        )}
        folders={filterLinkedDrivesByPowerUp(linkedDrives, { hasEditor, hasGallerySuite })}
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
      )}

      {packageInfoId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-macos-package-info-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPackageInfoId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                id="home-macos-package-info-title"
                className="text-lg font-semibold text-neutral-900 dark:text-white"
              >
                Package info
              </h3>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                onClick={() => setPackageInfoId(null)}
              >
                Close
              </button>
            </div>
            {packageInfoLoading ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
            ) : (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all text-xs text-neutral-700 dark:text-neutral-300">
                {JSON.stringify(packageInfoJson, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ) : null}

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        showLUTForVideo={previewFile?.driveId === creatorRawDriveId}
      />
    </div>
  );
}
