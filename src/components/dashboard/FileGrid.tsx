"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckSquare, ChevronLeft, Download, Film, Filter, FolderInput, Images, Loader2, Send, Share2, Trash2 } from "lucide-react";

const DRAG_THRESHOLD_PX = 5;

import { getDragMovePayload, getMovePayloadFromDragSource, setDragMovePayload } from "@/lib/dnd-move-items";
import { rectsIntersect } from "@/lib/utils";
import FolderCard, { type FolderItem } from "./FolderCard";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FolderListRow from "./FolderListRow";
import FilePreviewModal from "./FilePreviewModal";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import {
  filterDriveFoldersByPowerUp,
  filterLinkedDrivesByPowerUp,
} from "@/lib/drive-powerup-filter";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useGalleries } from "@/hooks/useGalleries";
import { usePinned, fetchPinnedFiles } from "@/hooks/usePinned";
import { useHeartedFiles } from "@/hooks/useHeartedFiles";
import { recordRecentOpen } from "@/hooks/useRecentOpens";
import { getAuthToken } from "@/lib/auth-token";
import { useBackup } from "@/context/BackupContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LinkedDrive } from "@/types/backup";
import ItemActionsMenu from "./ItemActionsMenu";
import BulkMoveModal from "./BulkMoveModal";
import CreateTransferModal, { type TransferModalFile } from "./CreateTransferModal";
import ShareModal from "./ShareModal";
import FileFiltersToolbar from "@/components/filters/FileFiltersToolbar";
import ActiveFilterBar from "@/components/filters/ActiveFilterBar";
import AdvancedFiltersDrawer from "@/components/filters/AdvancedFiltersDrawer";
import { useFilteredFiles } from "@/hooks/useFilteredFiles";
import { useDragToSelectAutoScroll } from "@/hooks/useDragToSelectAutoScroll";
import { useBulkDownload } from "@/hooks/useBulkDownload";
import DashboardRouteFade from "./DashboardRouteFade";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";
import FolderView from "./FolderView";
import AllFilesView from "./AllFilesView";
import {
  expandMacosPackageRowIds,
  isMacosPackageFileRow,
  mergeDriveFilesWithMacosPackages,
  recentFileFromMacosPackageListEntry,
  type MacosPackageListEntry,
} from "@/lib/macos-package-display";
import { fetchPackagesListCached } from "@/lib/packages-list-cache";
import { filterFilesForVirtualFolder } from "@/lib/metadata-display";
import type { FolderRollupCoverage } from "@/lib/metadata-display";

function mergeDisplayedFilesWithMacosPackages(
  displayedFiles: RecentFile[],
  packages: MacosPackageListEntry[],
  driveId: string,
  driveName: string
): RecentFile[] {
  const roots = new Set(packages.map((p) => p.root_relative_path.replace(/^\/+/, "")));
  const pkgIds = new Set(packages.map((p) => p.id));
  const filtered = displayedFiles.filter((f) => {
    if (f.macosPackageId && pkgIds.has(f.macosPackageId)) return false;
    const p = f.path.replace(/^\/+/, "");
    for (const r of roots) {
      if (!r) continue;
      if (p === r || p.startsWith(`${r}/`)) return false;
    }
    return true;
  });
  const synthetic = packages.map((pkg) =>
    recentFileFromMacosPackageListEntry(pkg, driveId, driveName) as RecentFile
  );
  return [...synthetic, ...filtered].sort((a, b) => {
    const ta = new Date(a.modifiedAt ?? 0).getTime();
    const tb = new Date(b.modifiedAt ?? 0).getTime();
    if (tb !== ta) return tb - ta;
    return a.name.localeCompare(b.name);
  });
}

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
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} drive${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;
  const canShare = total >= 1;
  const showDownload = selectedFileCount >= 1;
  const downloadDisabled = selectedFileCount > 50 || isDownloading;
  const downloadTitle = selectedFileCount > 50 ? "Download supports up to 50 files at once" : undefined;

  return (
    <div
      className="fixed left-3 right-3 z-50 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-3 dark:border-neutral-700 dark:bg-neutral-900"
      style={{
        bottom: "max(8rem, calc(env(safe-area-inset-bottom, 0px) + 6rem))",
      }}
    >
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

export default function FileGrid() {
  const {
    viewMode,
    setViewMode,
    cardSize,
    aspectRatio,
    thumbnailScale,
    showCardInfo,
  } = useLayoutSettings();
  // Grid columns: large capped at former medium density
  const gridColsClass =
    viewMode === "thumbnail"
      ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      : cardSize === "small"
        ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        : cardSize === "large"
          ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
          : "sm:grid-cols-3 md:grid-cols-4";
  const gridGapClass = viewMode === "thumbnail" ? "gap-3" : "gap-4";
  const listColSpan = 10;
  const [activeTab, setActiveTab] = useState<"recents" | "hearts">("recents");
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [currentDrive, setCurrentDrive] = useState<{ id: string; name: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<RecentFile[]>([]);
  const [driveListTruncated, setDriveListTruncated] = useState(false);
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
  const {
    files: heartedFiles,
    loading: heartedLoading,
    loadingMore: heartedLoadingMore,
    hasMore: heartedHasMore,
    loadMore: loadMoreHearted,
    refresh: refreshHearted,
  } = useHeartedFiles();
  const { linkedDrives, storageVersion, creatorRawDriveId } = useBackup();
  const { org } = useEnterprise();
  const { loading: subscriptionLoading } = useSubscription();
  const { hasEditor, hasGallerySuite, loading: powerUpContextLoading } = useEffectivePowerUps();
  const { setCurrentDrive: setCurrentFolderDriveId, currentDrivePath, setCurrentDrivePath, effectiveDriveIdForFiles } = useCurrentFolder();
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
  const [macosPackagesForFolder, setMacosPackagesForFolder] = useState<MacosPackageListEntry[]>([]);
  const [creativeFilterPackagesByDrive, setCreativeFilterPackagesByDrive] = useState<
    Record<string, MacosPackageListEntry[]>
  >({});
  /** macOS package roots for All Files / filtered views (collapse interior files like drive browse). */
  const [filterScopePackagesByDrive, setFilterScopePackagesByDrive] = useState<
    Record<string, MacosPackageListEntry[]>
  >({});
  const [packageInfoId, setPackageInfoId] = useState<string | null>(null);
  const [packageInfoJson, setPackageInfoJson] = useState<Record<string, unknown> | null>(null);
  const [packageInfoLoading, setPackageInfoLoading] = useState(false);
  const gridSectionRef = useRef<HTMLDivElement | null>(null);
  const selectionUpdateRef = useRef<number | null>(null);
  const lastSelectionRef = useRef<{ files: string; folders: string } | null>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const { confirm } = useConfirm();
  const { download: bulkDownload, downloadMacosPackageZip, isLoading: isDownloading } =
    useBulkDownload({ fetchFilesByIds });
  const handleBulkDownload = useCallback(() => {
    bulkDownload(Array.from(selectedFileIds));
  }, [bulkDownload, selectedFileIds]);
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
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  /** Files landing: flat grid from filter API (no Storage/RAW/Gallery folder tiles). */
  const allFilesFlatLanding =
    typeof pathname === "string" &&
    (/^\/(dashboard|enterprise)\/files$/.test(pathname) ||
      /^\/team\/[^/]+\/files$/.test(pathname));
  const teamAwareDriveName = (name: string) => name.replace(/^\[Team\]\s+/, "");
  const isBizziCloudBaseDrive = (name: string) => {
    const b = teamAwareDriveName(name);
    return b === "Storage" || b === "RAW" || b === "Gallery Media";
  };
  const {
    files: filteredFiles,
    loading: filtersLoading,
    loadMoreLoading: filtersLoadMoreLoading,
    hasMore: filterHasMore,
    loadMore: loadMoreFilteredFiles,
    hasFilters,
    useFilteredScoped,
    filterState,
    setFilter,
    removeFilterById,
    clearFilters,
    clearFiltersAndKeepDrive,
    activeFilters,
  } = useFilteredFiles({
    driveId: currentDrive?.id ?? null,
    effectiveDriveId: effectiveDriveIdForFiles,
    driveIdAsNavigation: isBizziCloudBaseDrive(currentDrive?.name ?? "")
      ? currentDrive?.id ?? null
      : null,
    scopeAllFilesAtRoot: allFilesFlatLanding && !currentDrive,
  });

  const teamOwnerUserIdForPackages =
    pathname ? /^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() || null : null;
  const isEnterprisePackagesScope = pathname?.startsWith("/enterprise") ?? false;
  const creativeProjectScopedDrives = useMemo((): LinkedDrive[] => {
    return linkedDrives.filter((d) => {
      if (isEnterprisePackagesScope && org?.id) return d.organization_id === org.id;
      if (teamOwnerUserIdForPackages) {
        return d.user_id === teamOwnerUserIdForPackages && !d.organization_id;
      }
      return !d.organization_id;
    });
  }, [linkedDrives, isEnterprisePackagesScope, org?.id, teamOwnerUserIdForPackages]);

  const creativeProjectsFilterActive = useFilteredScoped && filterState.creative_projects === true;

  const filteredDriveIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const f of filteredFiles) {
      if (f.driveId) ids.add(f.driveId);
    }
    return [...ids].sort().join(",");
  }, [filteredFiles]);

  useEffect(() => {
    if (!useFilteredScoped || creativeProjectsFilterActive || filteredDriveIdsKey === "") {
      setFilterScopePackagesByDrive({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const driveIds = filteredDriveIdsKey.split(",").filter(Boolean);
        const entries = await Promise.all(
          driveIds.map(async (driveId): Promise<[string, MacosPackageListEntry[]]> => {
            try {
              const packages = await fetchPackagesListCached({
                origin: base,
                token,
                driveId,
                folderPath: "",
                storageVersion,
              });
              return [driveId, packages];
            } catch {
              return [driveId, []];
            }
          })
        );
        if (!cancelled) setFilterScopePackagesByDrive(Object.fromEntries(entries));
      } catch {
        if (!cancelled) setFilterScopePackagesByDrive({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    useFilteredScoped,
    creativeProjectsFilterActive,
    filteredDriveIdsKey,
    storageVersion,
  ]);

  useEffect(() => {
    if (!creativeProjectsFilterActive) {
      setCreativeFilterPackagesByDrive({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const results = await Promise.all(
          creativeProjectScopedDrives.map(
            async (drive): Promise<[string, MacosPackageListEntry[]]> => {
              try {
                const packages = await fetchPackagesListCached({
                  origin: base,
                  token,
                  driveId: drive.id,
                  folderPath: "",
                  storageVersion,
                });
                return [drive.id, packages];
              } catch {
                return [drive.id, []];
              }
            }
          )
        );
        if (!cancelled) setCreativeFilterPackagesByDrive(Object.fromEntries(results));
      } catch {
        if (!cancelled) setCreativeFilterPackagesByDrive({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creativeProjectsFilterActive, creativeProjectScopedDrives, storageVersion]);

  const filteredFilesWithCreativePackages = useMemo((): RecentFile[] | null => {
    if (!creativeProjectsFilterActive) return null;
    const byDrive = new Map<string, RecentFile[]>();
    for (const f of filteredFiles) {
      if (!f.driveId) continue;
      const arr = byDrive.get(f.driveId) ?? [];
      arr.push(f);
      byDrive.set(f.driveId, arr);
    }
    const merged: RecentFile[] = [];
    const handled = new Set<string>();
    for (const drive of creativeProjectScopedDrives) {
      handled.add(drive.id);
      const pkgs = creativeFilterPackagesByDrive[drive.id] ?? [];
      const driveFilesForMerge = byDrive.get(drive.id) ?? [];
      merged.push(
        ...mergeDriveFilesWithMacosPackages(
          driveFilesForMerge,
          pkgs,
          drive.id,
          drive.name ?? "Folder"
        )
      );
    }
    for (const [driveId, files] of byDrive) {
      if (!handled.has(driveId)) merged.push(...files);
    }
    merged.sort((a, b) => {
      const ta = new Date(a.uploadedAt ?? a.modifiedAt ?? 0).getTime();
      const tb = new Date(b.uploadedAt ?? b.modifiedAt ?? 0).getTime();
      return tb - ta;
    });
    return merged;
  }, [
    creativeProjectsFilterActive,
    filteredFiles,
    creativeProjectScopedDrives,
    creativeFilterPackagesByDrive,
  ]);

  const filteredFilesWithScopePackages = useMemo((): RecentFile[] | null => {
    if (!useFilteredScoped || creativeProjectsFilterActive) return null;
    if (filteredFiles.length === 0) return [];
    const byDrive = new Map<string, RecentFile[]>();
    const looseNoDrive: RecentFile[] = [];
    for (const f of filteredFiles) {
      if (!f.driveId) {
        looseNoDrive.push(f);
        continue;
      }
      const arr = byDrive.get(f.driveId) ?? [];
      arr.push(f);
      byDrive.set(f.driveId, arr);
    }
    const merged: RecentFile[] = [];
    for (const [driveId, files] of byDrive) {
      const driveMeta = linkedDrives.find((d) => d.id === driveId);
      const pkgs = filterScopePackagesByDrive[driveId] ?? [];
      merged.push(
        ...mergeDriveFilesWithMacosPackages(
          files,
          pkgs,
          driveId,
          driveMeta?.name ?? "Storage"
        )
      );
    }
    const combined = [...looseNoDrive, ...merged];
    combined.sort((a, b) => {
      const ta = new Date(a.uploadedAt ?? a.modifiedAt ?? 0).getTime();
      const tb = new Date(b.uploadedAt ?? b.modifiedAt ?? 0).getTime();
      return tb - ta;
    });
    return combined;
  }, [
    useFilteredScoped,
    creativeProjectsFilterActive,
    filteredFiles,
    filterScopePackagesByDrive,
    linkedDrives,
  ]);

  const filesForPackageExpand = useMemo(
    () =>
      creativeProjectsFilterActive || useFilteredScoped ? filteredFiles : driveFiles,
    [creativeProjectsFilterActive, useFilteredScoped, filteredFiles, driveFiles]
  );

  const packagesForPackageExpand = useMemo(() => {
    if (creativeProjectsFilterActive) {
      return Object.values(creativeFilterPackagesByDrive).flat();
    }
    if (useFilteredScoped) {
      return Object.values(filterScopePackagesByDrive).flat();
    }
    return macosPackagesForFolder;
  }, [
    creativeProjectsFilterActive,
    creativeFilterPackagesByDrive,
    useFilteredScoped,
    filterScopePackagesByDrive,
    macosPackagesForFolder,
  ]);

  const handleSearchChange = useCallback(
    (v: string) => setFilter("search", v || undefined),
    [setFilter]
  );
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
  const activeFiltersWithLabels = useMemo(() => {
    let list = activeFilters.map((af) =>
      af.id === "gallery" && typeof af.value === "string"
        ? { ...af, label: galleryTitleById.get(af.value) ?? af.label }
        : af
    );
    // Don't show drive filter chip when inside a folder - user already knows where they are.
    // Check URL drive param too to avoid flash before currentDrive is set (e.g. /files?drive=xxx).
    const driveFromUrl = searchParams.get("drive");
    if (currentDrive || driveFromUrl) {
      list = list.filter((af) => af.id !== "drive");
    }
    return list;
  }, [activeFilters, galleryTitleById, currentDrive, searchParams]);

  const isSystemDrive = (d: { name: string; isCreatorRaw?: boolean }) => {
    const b = teamAwareDriveName(d.name);
    return b === "Storage" || d.isCreatorRaw === true || b === "Gallery Media";
  };

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
      customIcon: d.isCreatorRaw ? Film : teamAwareDriveName(d.name) === "Gallery Media" ? Images : undefined,
      preventDelete: isSystemDrive(d),
      preventRename: isSystemDrive(d),
      preventMove: isSystemDrive(d),
      isSystemFolder: isSystemDrive(d),
    }))
    .sort((a, b) => {
      const order = (name: string) => {
        const b = teamAwareDriveName(name);
        return b === "Storage" ? 0 : b === "RAW" ? 1 : b === "Gallery Media" ? 2 : 3;
      };
      return order(a.name) - order(b.name);
    });
  const pinnedFolderItems = folderItems.filter((f) => f.driveId && pinnedFolderIds.has(f.driveId));

  const storageDisplayContext = useMemo(() => {
    if (typeof pathname === "string" && pathname.startsWith("/enterprise")) {
      return { locationScope: "enterprise" as const };
    }
    if (typeof pathname === "string" && /^\/team\//.test(pathname)) {
      return { locationScope: "team" as const };
    }
    return { locationScope: "personal" as const };
  }, [pathname]);

  const loadDriveFiles = useCallback(
    async (driveId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setDriveFilesLoading(true);
      try {
        const { files, listTruncated } = await fetchDriveFiles(driveId);
        setDriveFiles(files);
        setDriveListTruncated(listTruncated);
      } catch {
        setDriveFiles([]);
        setDriveListTruncated(false);
      } finally {
        setDriveFilesLoading(false);
      }
    },
    [fetchDriveFiles]
  );

  const openDrive = useCallback(
    (id: string, name: string, pathInsideDrive = "") => {
      recordRecentOpen("folder", id, getAuthToken);
      setCurrentFolderDriveId(id);
      setCurrentDrive({ id, name });
      setCurrentDrivePath(pathInsideDrive.replace(/^\/+/, ""));
      loadDriveFiles(id);
      setSelectedFileIds(new Set());
      setSelectedFolderKeys(new Set());
      if (isBizziCloudBaseDrive(name)) {
        clearFiltersAndKeepDrive(id);
      }
    },
    [loadDriveFiles, setCurrentFolderDriveId, setCurrentDrivePath, clearFiltersAndKeepDrive]
  );

  const closeDrive = useCallback(() => {
    setCurrentFolderDriveId(null);
    setCurrentDrive(null);
    setCurrentDrivePath("");
    setDriveFiles([]);
    setDriveListTruncated(false);
    setSelectedFileIds(new Set());
    setSelectedFolderKeys(new Set());
  }, [setCurrentFolderDriveId, setCurrentDrivePath]);

  const currentDriveMeta = currentDrive
    ? linkedDrives.find((d) => d.id === currentDrive.id)
    : undefined;
  const driveBaseName = currentDriveMeta
    ? teamAwareDriveName(currentDriveMeta.name)
    : "";
  const isGalleryMediaDrive = !!currentDriveMeta && driveBaseName === "Gallery Media";
  const isPathTreeDrive =
    !!currentDrive &&
    (isGalleryMediaDrive ||
      driveBaseName === "Storage" ||
      currentDriveMeta?.is_creator_raw === true);

  const { subfolderItems, displayedFiles } = useMemo(() => {
    if (!currentDrive || !isPathTreeDrive) {
      return { subfolderItems: [] as FolderItem[], displayedFiles: driveFiles };
    }
    const prefix = currentDrivePath ? `${currentDrivePath}/` : "";
    const filesInView = currentDrivePath
      ? driveFiles.filter((f) => f.path.startsWith(prefix))
      : driveFiles;
    if (currentDrivePath) {
      const nextSegmentCounts = new Map<string, number>();
      const directFiles: typeof driveFiles = [];
      for (const f of filesInView) {
        const afterPrefix = f.path.slice(prefix.length);
        const rest = afterPrefix.split("/").filter(Boolean);
        if (rest.length === 1) {
          directFiles.push(f);
        } else if (rest.length >= 2) {
          const nextSegment = rest[0];
          nextSegmentCounts.set(nextSegment, (nextSegmentCounts.get(nextSegment) ?? 0) + 1);
        }
      }
      const nestedSubfolders: FolderItem[] = Array.from(nextSegmentCounts.entries()).map(
        ([segment, count]) => ({
          name:
            segment.toLowerCase() === "favorites"
              ? "Favorites"
              : segment.toLowerCase() === "selects"
                ? "Selects"
                : segment,
          type: "folder" as const,
          key: `path-nested-${currentDrive.id}|${currentDrivePath}|${segment}`,
          items: count,
          driveId: undefined,
          virtualFolder: true,
          hideShare: true,
          preventDelete: true,
          preventRename: true,
          pathPrefix: `${currentDrivePath}/${segment}`,
        })
      );
      return { subfolderItems: nestedSubfolders, displayedFiles: directFiles };
    }
    const galleryTitleMap = new Map(galleries.map((g) => [g.id, g.title]));
    const seen = new Map<string, { count: number; displayName: string }>();
    for (const f of driveFiles) {
      const parts = f.path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const folderKey = isGalleryMediaDrive ? (f.galleryId ?? parts[0]) : parts[0];
        const existing = seen.get(folderKey);
        const displayName =
          isGalleryMediaDrive && f.galleryId && galleryTitleMap.has(f.galleryId)
            ? galleryTitleMap.get(f.galleryId)!
            : folderKey;
        if (existing) {
          seen.set(folderKey, { count: existing.count + 1, displayName: existing.displayName });
        } else {
          seen.set(folderKey, { count: 1, displayName });
        }
      }
    }
    const subfolderList: FolderItem[] = Array.from(seen.entries()).map(
      ([folderKey, { count, displayName }]) => ({
        name: displayName,
        type: "folder" as const,
        key: `path-subfolder-${currentDrive.id}|${folderKey}`,
        items: count,
        driveId: undefined,
        virtualFolder: true,
        hideShare: true,
        preventDelete: true,
        preventRename: true,
        pathPrefix: folderKey,
      })
    );
    const rootFiles = driveFiles.filter((f) => !f.path.includes("/"));
    return { subfolderItems: subfolderList, displayedFiles: rootFiles };
  }, [
    currentDrive,
    isPathTreeDrive,
    driveFiles,
    currentDrivePath,
    isGalleryMediaDrive,
    galleries,
  ]);

  const virtualFolderRollupByKey = useMemo(() => {
    const map = new Map<string, { descendants: RecentFile[]; coverage: FolderRollupCoverage }>();
    if (!currentDrive || !isPathTreeDrive) return map;
    const coverage: FolderRollupCoverage = driveListTruncated ? "partial" : "full";
    for (const item of subfolderItems) {
      if (!item.virtualFolder || item.pathPrefix == null) continue;
      const descendants = filterFilesForVirtualFolder(driveFiles, item.pathPrefix, {
        isGalleryMediaDrive,
        currentDrivePath,
      });
      map.set(item.key, { descendants, coverage });
    }
    return map;
  }, [
    currentDrive,
    isPathTreeDrive,
    subfolderItems,
    driveFiles,
    driveListTruncated,
    isGalleryMediaDrive,
    currentDrivePath,
  ]);

  useEffect(() => {
    if (!currentDrive || useFilteredScoped) {
      setMacosPackagesForFolder([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const packages = await fetchPackagesListCached({
          origin: base,
          token,
          driveId: currentDrive.id,
          folderPath: currentDrivePath,
          storageVersion,
        });
        if (!cancelled) setMacosPackagesForFolder(packages);
      } catch {
        if (!cancelled) setMacosPackagesForFolder([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentDrive, currentDrivePath, useFilteredScoped, storageVersion]);

  const displayedFilesWithMacosPackages = useMemo(() => {
    if (!currentDrive || useFilteredScoped) return displayedFiles;
    return mergeDisplayedFilesWithMacosPackages(
      displayedFiles,
      macosPackagesForFolder,
      currentDrive.id,
      currentDrive.name
    );
  }, [currentDrive, useFilteredScoped, displayedFiles, macosPackagesForFolder]);

  useEffect(() => {
    if (!packageInfoId) {
      setPackageInfoJson(null);
      setPackageInfoLoading(false);
      return;
    }
    let cancelled = false;
    setPackageInfoLoading(true);
    setPackageInfoJson(null);
    (async () => {
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

  /** Stale-while-revalidate: keep showing previous files during filter load to avoid blinking */
  const fallbackFiles = currentDrive ? displayedFilesWithMacosPackages : recentFiles;
  /** Flat /files landing should not flash "recents" while the cross-drive filter loads */
  const skipFilteredFallbackWhileLoading =
    allFilesFlatLanding && !currentDrive && useFilteredScoped;
  const filesToShow = useFilteredScoped
    ? filtersLoading && filteredFiles.length === 0 && !skipFilteredFallbackWhileLoading
      ? fallbackFiles
      : creativeProjectsFilterActive
        ? (filteredFilesWithCreativePackages ?? filteredFiles)
        : (filteredFilesWithScopePackages ?? filteredFiles)
    : currentDrive
      ? displayedFilesWithMacosPackages
      : recentFiles;

  const showFolders = !useFilteredScoped;

  // Refresh drive files when storage changes (e.g. after upload) so UI updates in real time.
  // Use silent: true to avoid loading flash - keep current content visible during background refetch.
  useEffect(() => {
    if (currentDrive && storageVersion > 0) {
      loadDriveFiles(currentDrive.id, { silent: true });
    }
  }, [storageVersion, currentDrive, loadDriveFiles]);

  // Refresh when Uppy upload completes (global drop or + New) so files appear without manual refresh
  useEffect(() => {
    const handler = () => {
      if (currentDrive) {
        loadDriveFiles(currentDrive.id, { silent: true });
      }
    };
    window.addEventListener("storage-upload-complete", handler);
    return () => window.removeEventListener("storage-upload-complete", handler);
  }, [currentDrive, loadDriveFiles]);

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
  // Also when drive in URL differs from current (e.g. deep link or toolbar drive change)
  useEffect(() => {
    const driveId = searchParams.get("drive");
    if (!driveId) return;
    const folder = visibleDriveFolders.find((d) => d.id === driveId);
    if (!folder) return;
    const shouldOpen = !currentDrive || currentDrive.id !== driveId;
    if (shouldOpen) {
      openDrive(driveId, folder.name);
      if (isBizziCloudBaseDrive(folder.name)) {
        clearFiltersAndKeepDrive(driveId);
      }
    }
  }, [searchParams, currentDrive, visibleDriveFolders, openDrive, clearFiltersAndKeepDrive]);

  // Deep link from comment activity (and similar): /files?preview=<fileId> opens immersive preview
  const previewFromUrl = searchParams.get("preview");
  useEffect(() => {
    const fileId = previewFromUrl?.trim();
    if (!fileId) return;
    let cancelled = false;
    void (async () => {
      const files = await fetchFilesByIds([fileId], 1);
      if (cancelled) return;
      if (files[0]) setPreviewFile(files[0]);
      const next = new URLSearchParams(searchParams.toString());
      if (!next.has("preview")) return;
      next.delete("preview");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [previewFromUrl, fetchFilesByIds, router, pathname, searchParams]);

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

  const setSelectionFromDrag = useCallback((fileIds: string[], folderKeys: string[], additive?: boolean) => {
    if (additive) {
      setSelectedFileIds((prev) => new Set([...prev, ...fileIds]));
      setSelectedFolderKeys((prev) => new Set([...prev, ...folderKeys]));
    } else {
      setSelectedFileIds(new Set(fileIds));
      setSelectedFolderKeys(new Set(folderKeys));
    }
  }, []);

  const currentDriveId = currentDrive?.id;
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
      setSelectionFromDrag(fileIds, folderKeys, true);
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
      /** Trash API expands `macos-pkg:*` server-side (client only loads a page of drive files). */
      const allFileIdsToDelete = [...new Set(fileIds)];

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
      const expandedIds = expandMacosPackageRowIds(fileIds, filesForPackageExpand, packagesForPackageExpand);
      if (expandedIds.length > 0) {
        await moveFilesToFolder(expandedIds, targetDriveId);
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
      if (currentDrive && expandedIds.length > 0) {
        loadDriveFiles(currentDrive.id);
      }
      const destName = linkedDrives.find((d) => d.id === targetDriveId)?.name ?? "folder";
      setMoveNotice(`Items moved into the "${destName}" folder`);
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
      filesForPackageExpand,
      packagesForPackageExpand,
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
    const fileIds = expandMacosPackageRowIds(
      Array.from(selectedFileIds),
      filesForPackageExpand,
      packagesForPackageExpand
    );
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
  }, [selectedFileIds, fetchFilesByIds, filesForPackageExpand, packagesForPackageExpand]);

  const handleBulkShare = useCallback(async () => {
    const fileIds = expandMacosPackageRowIds(
      Array.from(selectedFileIds),
      filesForPackageExpand,
      packagesForPackageExpand
    );
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
    filesForPackageExpand,
    packagesForPackageExpand,
  ]);

  const openMacosPackageInfo = useCallback((file: RecentFile) => {
    if (!file.macosPackageId) return;
    setPackageInfoId(file.macosPackageId);
  }, []);

  const navigateIntoMacosPackage = useCallback(
    (file: RecentFile) => {
      if (!file.driveId || !isMacosPackageFileRow(file)) return;
      const folder =
        visibleDriveFolders.find((d) => d.id === file.driveId) ??
        linkedDrives.find((d) => d.id === file.driveId);
      const name = folder?.name ?? file.driveName ?? "Folder";
      const pathInside = file.path.replace(/^\/+/, "");
      clearFilters();
      openDrive(file.driveId, name, pathInside);
    },
    [visibleDriveFolders, linkedDrives, clearFilters, openDrive]
  );

  const FilesViewWrapper = currentDrive ? FolderView : AllFilesView;

  const recentsRootReady = !loading && !subscriptionLoading && !powerUpContextLoading;
  const mainGridFadeReady = currentDrive
    ? !driveFilesLoading
    : activeTab === "recents"
      ? recentsRootReady
      : !(heartedLoading && heartedFiles.length === 0);

  return (
    <div
      ref={gridSectionRef}
      className={`w-full flex flex-1 min-h-0 flex-col space-y-0 ${dragState?.isActive ? "select-none" : ""}`}
      data-selectable-grid
      onMouseDown={handleMouseDown}
    >
      {/* Filter section — compact, no section title bar */}
      <section className="shrink-0 border-b border-neutral-200/60 py-4 last:border-b-0 dark:border-neutral-800/60">
        <div className="space-y-3">
          <FileFiltersToolbar
            searchValue={(filterState.search as string) ?? ""}
            onSearchChange={handleSearchChange}
            filterState={filterState}
            setFilter={setFilter}
            sortValue={(filterState.sort as string) ?? "newest"}
            onSortChange={() => {}}
            onFiltersClick={() => setFilterDrawerOpen(true)}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            hasActiveFilters={hasFilters}
          />
          {(useFilteredScoped || !currentDrive) && (
          <ActiveFilterBar
            activeFilters={activeFiltersWithLabels}
            loadedCount={filesToShow.length}
            hasMoreFromApi={useFilteredScoped ? filterHasMore : false}
            onLoadMore={useFilteredScoped ? loadMoreFilteredFiles : undefined}
            loadMoreLoading={useFilteredScoped ? filtersLoadMoreLoading : false}
            onRemove={removeFilterById}
            onClearAll={clearFilters}
            onSaveView={undefined}
            isLoading={useFilteredScoped && filtersLoading}
          />
          )}
        </div>
      </section>

        <AdvancedFiltersDrawer
          open={filterDrawerOpen}
          onOpenChange={setFilterDrawerOpen}
          filterState={filterState}
          setFilter={setFilter}
          onReset={clearFilters}
          drives={drivesForFilter}
          galleries={galleriesForFilter}
          insideFolder={!!currentDrive}
        />

      {/* Scrollable content — distinct layout per view: FolderView vs AllFilesView */}
      <div
        className="min-h-0 flex-1 overflow-auto space-y-0"
        data-scroll-container
        data-view-type={currentDrive ? "folder" : "all-files"}
      >
      <FilesViewWrapper>
      {currentDrive && (
        <div className="flex items-center gap-2 py-4 text-sm">
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

      {/* Pinned shortcuts (only at root) - compact section */}
      {!currentDrive && (pinnedFolderItems.length > 0 || pinnedFileIds.size > 0 || pinnedFilesLoading) && (
        <section className="border-b border-neutral-200/60 py-4 last:border-b-0 dark:border-neutral-800/60">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Pinned</h3>
          <DashboardRouteFade
            ready={pinnedFileIds.size === 0 || !pinnedFilesLoading}
            srOnlyMessage="Loading pinned items"
            compact
          >
          {viewMode === "list" ? (
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
                        displayContext={storageDisplayContext}
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
                  {pinnedFiles.map((file) => (
                    <FileListRow
                      key={file.id}
                      file={file}
                      displayContext={storageDisplayContext}
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
                      draggable={!!file.driveId}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={`grid ${gridGapClass} ${gridColsClass}`}>
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
                      onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                      isDropTarget={isDropTarget}
                      onItemsDropped={handleDropOnFolder}
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
                              }
                            }
                          : undefined
                      }
                      selectable={!!drive && !item.preventDelete}
                      selected={selectedFolderKeys.has(item.key)}
                      onSelect={() => toggleFolderSelection(item.key)}
                      presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
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
                  draggable={!!file.driveId}
                  onDragStart={handleDragStart}
                  className={`h-full min-h-0${!!file.driveId ? " cursor-grab active:cursor-grabbing" : ""}`}
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
                    layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                    layoutAspectRatio={aspectRatio}
                    thumbnailScale={thumbnailScale}
                    showCardInfo={showCardInfo}
                    presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
                  />
                </div>
              ))}
            </div>
          )}
          </DashboardRouteFade>
        </section>
      )}

      {/* Recents / Starred / Drive content — main section */}
      <DashboardRouteFade ready={mainGridFadeReady} srOnlyMessage="Loading files">
      <section className="relative border-b border-neutral-200/60 py-4 last:border-b-0 dark:border-neutral-800/60">
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
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
          {currentDrive ? currentDrive.name : activeTab === "recents" ? "Recents" : "Hearts"}
        </h2>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
          {!currentDrive && (
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
                onClick={() => setActiveTab("hearts")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "hearts"
                    ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                Hearts
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {(useFilteredScoped ? filesToShow.length > 0 : currentDrive ? subfolderItems.length > 0 || displayedFilesWithMacosPackages.length > 0 : folderItems.length > 0 || recentFiles.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (useFilteredScoped) {
                    setSelectedFileIds(new Set(filesToShow.map((f) => f.id)));
                    setSelectedFolderKeys(new Set());
                  } else if (currentDrive) {
                    setSelectedFileIds(new Set(displayedFilesWithMacosPackages.map((f) => f.id)));
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
          </div>
        </div>

        {/* File grid - stale-while-revalidate: keep showing previous files during filter load to avoid blink */}
        {currentDrive ? (
          useFilteredScoped && filesToShow.length === 0 && !filtersLoading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No files match your filters. Try adjusting or clearing filters.
          </div>
        ) : useFilteredScoped || subfolderItems.length > 0 || displayedFilesWithMacosPackages.length > 0 ? (
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
                  <tbody data-selectable-grid>
                    {useFilteredScoped && filtersLoading && (
                      <tr>
                        <td colSpan={listColSpan} className="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent dark:border-bizzi-cyan dark:border-t-transparent" />
                            Searching…
                          </span>
                        </td>
                      </tr>
                    )}
                    {showFolders && subfolderItems.map((item) => {
                      const canDragFolder = !!item.driveId && !item.preventMove;
                      return (
                        <FolderListRow
                          key={item.key}
                          item={item}
                          displayContext={storageDisplayContext}
                          folderRollup={virtualFolderRollupByKey.get(item.key)}
                          currentDriveName={currentDrive?.name ?? null}
                          onClick={() => {
                            setCurrentDrivePath(item.pathPrefix ?? item.name);
                            setSelectedFileIds(new Set());
                            setSelectedFolderKeys(new Set());
                          }}
                          selectable={!!item.driveId || !!item.virtualFolder}
                          selected={selectedFolderKeys.has(item.key)}
                          onSelect={() => toggleFolderSelection(item.key)}
                          draggable={canDragFolder}
                          onDragStart={handleDragStart}
                        />
                      );
                    })}
                    {filesToShow.map((file) => {
                      const isPkg = isMacosPackageFileRow(file);
                      return (
                        <FileListRow
                          key={file.id}
                          file={file}
                          displayContext={storageDisplayContext}
                          onClick={() => (isPkg ? openMacosPackageInfo(file) : setPreviewFile(file))}
                          onDelete={
                            isPkg
                              ? async () => {
                                  const n = file.macosPackageFileCount ?? "all";
                                  const ok = await confirm({
                                    message: `Move package "${file.name}" (${n} files) to trash? You can restore from Deleted files.`,
                                    destructive: true,
                                    confirmLabel: "Move to trash",
                                  });
                                  if (!ok) return;
                                  await deleteFiles([file.id]);
                                  if (currentDrive) loadDriveFiles(currentDrive.id);
                                }
                              : async () => {
                                  await deleteFile(file.id);
                                  if (currentDrive) loadDriveFiles(currentDrive.id);
                                }
                          }
                          selectable
                          selected={selectedFileIds.has(file.id)}
                          onSelect={() => toggleFileSelection(file.id)}
                          onAfterRename={() => currentDrive && loadDriveFiles(currentDrive.id)}
                          draggable={!!file.driveId && !isPkg}
                          onDragStart={handleDragStart}
                          onDownloadPackage={
                            isPkg && file.macosPackageId
                              ? () => downloadMacosPackageZip(file.macosPackageId!)
                              : undefined
                          }
                          onPackageInfo={isPkg ? () => openMacosPackageInfo(file) : undefined}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
            <div
              data-selectable-grid
              className={`relative grid ${gridGapClass} ${gridColsClass}`}
            >
              {useFilteredScoped && filtersLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 text-sm text-neutral-500 dark:bg-neutral-900/80 dark:text-neutral-400" aria-busy="true">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent dark:border-bizzi-cyan dark:border-t-transparent" />
                    Searching…
                  </span>
                </div>
              )}
              {showFolders && subfolderItems.map((item) => {
                const isFolderInSelection = selectedFolderKeys.has(item.key);
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
                      onClick={() => {
                        setCurrentDrivePath(item.pathPrefix ?? item.name);
                        setSelectedFileIds(new Set());
                        setSelectedFolderKeys(new Set());
                      }}
                      selectable
                      selected={isFolderInSelection}
                      onSelect={() => toggleFolderSelection(item.key)}
                      layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                      layoutAspectRatio={aspectRatio}
                      showCardInfo={showCardInfo}
                      presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
                    />
                  </div>
                );
              })}
              {filesToShow.map((file) => {
                const isPkg = isMacosPackageFileRow(file);
                return (
                  <div
                    key={file.id}
                    data-selectable-item
                    data-item-type={isPkg ? "macos-package" : "file"}
                    data-item-id={file.id}
                    draggable={!!file.driveId && !isPkg}
                    onDragStart={handleDragStart}
                    className={`h-full min-h-0${!!file.driveId && !isPkg ? " cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <FileCard
                      file={file}
                      onClick={() => (isPkg ? openMacosPackageInfo(file) : setPreviewFile(file))}
                      onDelete={
                        isPkg
                          ? async () => {
                              const n = file.macosPackageFileCount ?? "all";
                              const ok = await confirm({
                                message: `Move package "${file.name}" (${n} files) to trash? You can restore from Deleted files.`,
                                destructive: true,
                                confirmLabel: "Move to trash",
                              });
                              if (!ok) return;
                              await deleteFiles([file.id]);
                              if (currentDrive) loadDriveFiles(currentDrive.id);
                            }
                          : async () => {
                              await deleteFile(file.id);
                              if (currentDrive) loadDriveFiles(currentDrive.id);
                            }
                      }
                      selectable
                      selected={selectedFileIds.has(file.id)}
                      onSelect={() => toggleFileSelection(file.id)}
                      onAfterRename={() => currentDrive && loadDriveFiles(currentDrive.id)}
                      layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                      layoutAspectRatio={aspectRatio}
                      thumbnailScale={thumbnailScale}
                      showCardInfo={showCardInfo}
                      onDownloadPackage={
                        isPkg && file.macosPackageId
                          ? () => downloadMacosPackageZip(file.macosPackageId!)
                          : undefined
                      }
                      onPackageInfo={isPkg ? () => openMacosPackageInfo(file) : undefined}
                      onMacosPackageNavigate={
                        isPkg && (useFilteredScoped || (currentDrive && isPathTreeDrive))
                          ? () => navigateIntoMacosPackage(file)
                          : undefined
                      }
                      presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
                    />
                  </div>
                );
              })}
            </div>
            )
          ) : (
            <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {isGalleryMediaDrive
                ? "No gallery media yet. Upload photos in a gallery to see them organized by gallery here."
                : "No files in this drive yet. Use New → File Upload to add files."}
            </div>
          )
        ) : activeTab === "recents" ? (
          <>
            {showFolders && folderItems.length > 0 && (
              <>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Your synced drives</h3>
                {viewMode === "list" ? (
                  <div className="mb-8 rounded-xl border border-neutral-200 bg-white overflow-x-auto dark:border-neutral-700 dark:bg-neutral-900">
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
                      <tbody data-selectable-grid>
                        {folderItems.map((item) => {
                          const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                          const driveId = item.driveId ?? drive?.id ?? "";
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
                              displayContext={storageDisplayContext}
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
                                        if (currentDriveId === driveId) closeDrive();
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
                  data-selectable-grid
                  className={`mb-8 grid ${gridGapClass} ${gridColsClass}`}
                >
                  {folderItems.map((item) => {
                    const drive = item.driveId ? linkedDrives.find((d) => d.id === item.driveId) : null;
                    const driveId = item.driveId ?? drive?.id ?? "";
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
                          onClick={() => item.driveId && openDrive(item.driveId, item.name)}
                          isDropTarget={isDropTarget}
                          onItemsDropped={handleDropOnFolder}
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
                                    if (currentDriveId === driveId) closeDrive();
                                    await refetch();
                                  }
                                }
                              : undefined
                          }
                          selectable={!!drive && !item.preventDelete}
                          selected={selectedFolderKeys.has(item.key)}
                          onSelect={() => toggleFolderSelection(item.key)}
                          presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
                        />
                      </div>
                    );
                  })}
                </div>
                )}
              </>
            )}
            {filesToShow.length > 0 && (
              <>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {useFilteredScoped ? "Files" : "Recently synced files"}
                </h3>
                {viewMode === "list" ? (
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
                      <tbody data-selectable-grid>
                        {filesToShow.map((file) => (
                          <FileListRow
                            key={file.id}
                            file={file}
                            displayContext={storageDisplayContext}
                            onClick={() => setPreviewFile(file)}
                            onDelete={async () => {
                              await deleteFile(file.id);
                            }}
                            selectable
                            selected={selectedFileIds.has(file.id)}
                            onSelect={() => toggleFileSelection(file.id)}
                            draggable={!!file.driveId}
                            onDragStart={handleDragStart}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                <div
                  data-selectable-grid
                  className={`relative grid ${gridGapClass} ${gridColsClass}`}
                >
                  {useFilteredScoped && filtersLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 text-sm text-neutral-500 dark:bg-neutral-900/80 dark:text-neutral-400" aria-busy="true">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent dark:border-bizzi-cyan dark:border-t-transparent" />
                        Searching…
                      </span>
                    </div>
                  )}
                  {filesToShow.map((file) => {
                    const isPkg = isMacosPackageFileRow(file);
                    return (
                      <div
                        key={file.id}
                        data-selectable-item
                        data-item-type={isPkg ? "macos-package" : "file"}
                        data-item-id={file.id}
                        draggable={!!file.driveId && !isPkg}
                        onDragStart={handleDragStart}
                        className={`h-full min-h-0${!!file.driveId && !isPkg ? " cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        <FileCard
                          file={file}
                          onClick={() => (isPkg ? openMacosPackageInfo(file) : setPreviewFile(file))}
                          onDelete={
                            isPkg
                              ? async () => {
                                  const n = file.macosPackageFileCount ?? "all";
                                  const ok = await confirm({
                                    message: `Move package "${file.name}" (${n} files) to trash? You can restore from Deleted files.`,
                                    destructive: true,
                                    confirmLabel: "Move to trash",
                                  });
                                  if (!ok) return;
                                  await deleteFiles([file.id]);
                                  clearFilters();
                                }
                              : async () => {
                                  await deleteFile(file.id);
                                }
                          }
                          selectable
                          selected={selectedFileIds.has(file.id)}
                          onSelect={() => toggleFileSelection(file.id)}
                          layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                          layoutAspectRatio={aspectRatio}
                          thumbnailScale={thumbnailScale}
                          showCardInfo={showCardInfo}
                          onDownloadPackage={
                            isPkg && file.macosPackageId
                              ? () => downloadMacosPackageZip(file.macosPackageId!)
                              : undefined
                          }
                          onPackageInfo={isPkg ? () => openMacosPackageInfo(file) : undefined}
                          onMacosPackageNavigate={
                            isPkg ? () => navigateIntoMacosPackage(file) : undefined
                          }
                          presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
                        />
                      </div>
                    );
                  })}
                </div>
                )}
              </>
            )}
            {!loading &&
              useFilteredScoped &&
              !filtersLoading &&
              filesToShow.length === 0 && (
                <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  {hasFilters
                    ? "No files match your filters. Try adjusting or clearing filters."
                    : "No files yet. Use New → File Upload, or refresh after uploading."}
                </div>
              )}
            {!loading && !useFilteredScoped && folderItems.length === 0 && filesToShow.length === 0 && (
              <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No files yet. Use New → File Upload to add files to this drive.
              </div>
            )}
          </>
        ) : heartedFiles.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Files you heart will appear here for quick access.
          </div>
        ) : (
          <>
            {viewMode === "list" ? (
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
                    {heartedFiles.map((file) => (
                      <FileListRow
                        key={file.id}
                        file={file}
                        displayContext={storageDisplayContext}
                        onClick={() => setPreviewFile(file)}
                        onDelete={async () => {
                          await deleteFile(file.id);
                          refreshHearted();
                        }}
                        draggable={!!file.driveId}
                        onDragStart={handleDragStart}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div data-selectable-grid className={`relative grid ${gridGapClass} ${gridColsClass}`}>
                {heartedFiles.map((file) => (
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
                      onClick={() => setPreviewFile(file)}
                      onDelete={async () => {
                        await deleteFile(file.id);
                        refreshHearted();
                      }}
                      layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                      layoutAspectRatio={aspectRatio}
                      thumbnailScale={thumbnailScale}
                      showCardInfo={showCardInfo}
                      presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
                    />
                  </div>
                ))}
              </div>
            )}
            {heartedHasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={loadMoreHearted}
                  disabled={heartedLoadingMore}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {heartedLoadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      </DashboardRouteFade>
      </FilesViewWrapper>
        </div>

        {moveNotice ? (
          <div
            role="status"
            className="fixed bottom-[max(12rem,calc(env(safe-area-inset-bottom,0px)+10rem))] left-1/2 z-[45] flex max-w-[min(92vw,24rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-lg dark:border-emerald-800/60 dark:bg-emerald-950/90 dark:text-emerald-100"
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
          onDownload={handleBulkDownload}
          isDownloading={isDownloading}
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

      {packageInfoId && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="macos-package-info-title"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
              onClick={() => setPackageInfoId(null)}
            >
              <div
                className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3
                    id="macos-package-info-title"
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
            </div>,
            document.body,
          )
        : null}

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        showLUTForVideo={previewFile?.driveId === creatorRawDriveId}
      />
    </div>
  );
}
