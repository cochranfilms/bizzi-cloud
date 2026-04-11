"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useContext } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  CheckSquare,
  ChevronLeft,
  Film,
  Filter,
  Images,
  Loader2,
  Cloud,
} from "lucide-react";

const DRAG_THRESHOLD_PX = 5;

import {
  getDragMovePayload,
  getMovePayloadFromDragSource,
  setDragMovePayload,
  type FolderDropMoveTarget,
} from "@/lib/dnd-move-items";
import { MOVE_ALREADY_AT_DESTINATION } from "@/lib/move-and-folder-naming";
import { rectsIntersect } from "@/lib/utils";
import FolderCard, { type FolderItem } from "./FolderCard";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FolderListRow from "./FolderListRow";
import FilePreviewModal from "./FilePreviewModal";
import { fetchStorageFolderList, useCloudFiles } from "@/hooks/useCloudFiles";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import {
  filterDriveFoldersByPowerUp,
  filterLinkedDrivesByPowerUp,
  filterLinkedDrivesForMoveTargets,
} from "@/lib/drive-powerup-filter";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useGalleries } from "@/hooks/useGalleries";
import { usePinned, fetchPinnedFiles } from "@/hooks/usePinned";
import { useHeartedFiles } from "@/hooks/useHeartedFiles";
import { recordRecentOpen } from "@/hooks/useRecentOpens";
import { getAuthToken } from "@/lib/auth-token";
import { useFilePreviewModalRawLut } from "@/hooks/useFilePreviewModalRawLut";
import { useBackup } from "@/context/BackupContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useConfirm } from "@/hooks/useConfirm";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LinkedDrive } from "@/types/backup";
import {
  isLinkedDriveFolderModelV2,
  isStorageFoldersV2PillarDrive,
} from "@/lib/linked-drive-folder-model";
import {
  STORAGE_UPLOAD_COMPLETE_EVENT,
  type StorageUploadCompleteDetail,
} from "@/lib/storage-upload-complete-event";
import ItemActionsMenu from "./ItemActionsMenu";
import { BulkActionBar } from "./BulkActionBar";
import BulkMoveModal from "./BulkMoveModal";
import CreateTransferModal, { type TransferModalFile } from "./CreateTransferModal";
import ShareModal from "./ShareModal";
import StorageLocationMenu from "./StorageLocationMenu";
import RenameModal from "./RenameModal";
import CreateFolderModal from "./CreateFolderModal";
import StorageFolderTreePickerModal from "./StorageFolderTreePickerModal";
import { FileFiltersTopBarChrome, FileFiltersExpandedStrip } from "@/components/filters/FileFiltersToolbar";
import { FilesFilterTopChromeContext } from "@/context/FilesFilterTopChromeContext";
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
import { mergePinnedFolderItems } from "@/lib/merge-pinned-folder-items";
import { parseStorageVirtualFolderKey } from "@/lib/storage-virtual-folder-key";
import { buildStorageV2FolderPinId, parseStorageV2FolderPinId } from "@/lib/storage-v2-folder-pin";
import { bulkShareArgsFromFolderKeys } from "@/lib/bulk-share-folder-keys";
import { useAuth } from "@/context/AuthContext";
import { fetchPackagesListCached } from "@/lib/packages-list-cache";
import { filterFilesForVirtualFolder } from "@/lib/metadata-display";
import type { FolderRollupCoverage } from "@/lib/metadata-display";
import {
  buildGalleryMediaPathSegmentIndex,
  canonicalGalleryIdForGalleryMediaPath,
  formatGalleryMediaFolderBreadcrumb,
  galleryMediaStorageRootForCanonicalId,
} from "@/lib/gallery-media-path";
import { resolveUploadDestination } from "@/lib/upload-destination-resolve";
import { useUppyUpload } from "@/context/UppyUploadContext";

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

export type FileGridProps = {
  /**
   * Renders on Home (not /files): syncs browse state to the home pathname and auto-opens Storage when no `drive` param.
   */
  embeddedHomeStorage?: boolean;
  /**
   * When true (All Files /files landings only): framed inline Storage browser like Home, plus Recents / Hearts / Storage tabs.
   */
  inlineStorageOnFilesPage?: boolean;
  /**
   * Home page only: reports embedded Storage grid bulk selection so the parent can avoid a second bulk action bar.
   */
  onEmbeddedBulkSelectionChange?: (fileCount: number, folderCount: number) => void;
};

export default function FileGrid({
  embeddedHomeStorage = false,
  inlineStorageOnFilesPage = false,
  onEmbeddedBulkSelectionChange,
}: FileGridProps) {
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
  const [filesLandingTab, setFilesLandingTab] = useState<"recents" | "hearts" | "storage">(
    "storage"
  );
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [currentDrive, setCurrentDrive] = useState<{ id: string; name: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<RecentFile[]>([]);
  const [v2StorageSubfolders, setV2StorageSubfolders] = useState<FolderItem[]>([]);
  /** Tracks a v2 subfolder row for the standard dashboard opacity reveal after create. */
  const [storageV2RevealFolderKey, setStorageV2RevealFolderKey] = useState<string | null>(null);
  const [v2FolderBreadcrumb, setV2FolderBreadcrumb] = useState("");
  const [driveListTruncated, setDriveListTruncated] = useState(false);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  /** Supersedes overlapping loadDriveFiles calls (URL effect + click handler) so UI and loading flag stay consistent. */
  const loadDriveFilesGenRef = useRef(0);
  const {
    driveFolders,
    recentFiles,
    recentUploads,
    recentUploadsLoading,
    fetchRecentUploads,
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
    moveFilesToStorageFolder,
    renameStorageFolder,
    moveStorageFolder,
    trashAllFilesUnderStoragePath,
    trashStorageFolderSubtree,
  } = useCloudFiles();
  const { galleries } = useGalleries();
  const galleryMediaPathSegmentIndex = useMemo(
    () => buildGalleryMediaPathSegmentIndex(galleries),
    [galleries]
  );
  const {
    pinnedFolderIds,
    pinnedFolderLabels,
    pinnedFileIds,
    pinItem,
    unpinItem,
    isPinned,
    refetch: refetchPinned,
  } = usePinned();
  const { user } = useAuth();
  const {
    files: heartedFiles,
    loading: heartedLoading,
    loadingMore: heartedLoadingMore,
    hasMore: heartedHasMore,
    loadMore: loadMoreHearted,
    refresh: refreshHearted,
    workspaceHeartsActive,
  } = useHeartedFiles({ inferWorkspaceHeartsFromRoute: inlineStorageOnFilesPage });
  const {
    linkedDrives,
    storageVersion,
    fetchDrives,
    bumpStorageVersion,
    loading: backupDrivesLoading,
    getOrCreateStorageDrive,
    setFileUploadErrorMessage,
    clearFileUploadError,
  } = useBackup();
  const { org } = useEnterprise();
  const uppyUpload = useUppyUpload();
  const { loading: subscriptionLoading } = useSubscription();
  const { hasEditor, hasGallerySuite, loading: powerUpContextLoading } = useEffectivePowerUps();
  const {
    setCurrentDrive: setCurrentFolderDriveId,
    currentDrivePath,
    setCurrentDrivePath,
    storageParentFolderId,
    setStorageParentFolderId,
    storageUploadFolderLabel,
    setStorageUploadFolderLabel,
    effectiveDriveIdForFiles,
    selectedWorkspaceId,
  } = useCurrentFolder();
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
  const [moveErrorNotice, setMoveErrorNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!moveNotice) return;
    const t = window.setTimeout(() => setMoveNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [moveNotice]);
  useEffect(() => {
    if (!moveErrorNotice) return;
    const t = window.setTimeout(() => setMoveErrorNotice(null), 6500);
    return () => window.clearTimeout(t);
  }, [moveErrorNotice]);
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
  const [storageFolderListError, setStorageFolderListError] = useState<string | null>(null);
  const [storageUpgradeError, setStorageUpgradeError] = useState<string | null>(null);
  const [storageV2MigrateLoading, setStorageV2MigrateLoading] = useState(false);
  const [storageContextFolderVersion, setStorageContextFolderVersion] = useState<number | null>(null);
  const [storagePathCreateOpen, setStoragePathCreateOpen] = useState(false);
  const [storagePathRenameOpen, setStoragePathRenameOpen] = useState(false);
  const [storagePathMoveOpen, setStoragePathMoveOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isEnterpriseFilesNoDrive =
    pathname === "/enterprise/files" &&
    !searchParams?.get("drive") &&
    !searchParams?.get("drive_id");
  const setFilesTopBarChrome = useContext(FilesFilterTopChromeContext)?.setChrome;
  const router = useRouter();
  /** Files landing: flat grid from filter API (no Storage/RAW/Gallery folder tiles). */
  const allFilesFlatLanding =
    typeof pathname === "string" &&
    (/^\/(dashboard|enterprise)\/files$/.test(pathname) ||
      /^\/team\/[^/]+\/files$/.test(pathname) ||
      /^\/desktop\/app\/files$/.test(pathname));
  const teamAwareDriveName = (name: string) => name.replace(/^\[Team\]\s+/, "");
  const hasInlineStorageDrive = useMemo(
    () =>
      linkedDrives.some(
        (d) => teamAwareDriveName(d.name) === "Storage" && d.is_creator_raw !== true
      ),
    [linkedDrives]
  );
  const threeTabFilesLanding =
    allFilesFlatLanding && inlineStorageOnFilesPage && hasInlineStorageDrive;
  const isBizziCloudBaseDrive = (name: string) => {
    const b = teamAwareDriveName(name);
    return b === "Storage" || b === "RAW" || b === "Gallery Media";
  };

  useEffect(() => {
    const wantAutoStorageHome = embeddedHomeStorage && !threeTabFilesLanding;
    const wantAutoStorageFiles =
      threeTabFilesLanding && filesLandingTab === "storage";
    if (!wantAutoStorageHome && !wantAutoStorageFiles) return;
    if (backupDrivesLoading) return;
    const storageMeta = linkedDrives.find(
      (d) => teamAwareDriveName(d.name) === "Storage" && d.is_creator_raw !== true
    );
    if (!storageMeta?.id) return;
    if (searchParams.get("drive")) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("drive", storageMeta.id);
    const q = sp.toString();
    router.replace(`${pathname}?${q}`, { scroll: false });
  }, [
    embeddedHomeStorage,
    threeTabFilesLanding,
    filesLandingTab,
    backupDrivesLoading,
    linkedDrives,
    searchParams,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (!threeTabFilesLanding) return;
    const driveId = searchParams.get("drive");
    if (!driveId) return;
    const storageMeta = linkedDrives.find(
      (d) => teamAwareDriveName(d.name) === "Storage" && d.is_creator_raw !== true
    );
    if (storageMeta?.id === driveId) setFilesLandingTab("storage");
  }, [threeTabFilesLanding, searchParams, linkedDrives]);

  useEffect(() => {
    if (!embeddedHomeStorage) return;
    onEmbeddedBulkSelectionChange?.(selectedFileIds.size, selectedFolderKeys.size);
  }, [
    embeddedHomeStorage,
    selectedFileIds,
    selectedFolderKeys,
    onEmbeddedBulkSelectionChange,
  ]);

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
    preserveDriveQueryOnClear: !!currentDrive,
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

  useEffect(() => {
    if (!setFilesTopBarChrome || !allFilesFlatLanding) return;
    setFilesTopBarChrome(
      <FileFiltersTopBarChrome
        searchValue={(filterState.search as string) ?? ""}
        onSearchChange={handleSearchChange}
        quickFiltersOpen={quickFiltersOpen}
        onToggleQuickFilters={() => setQuickFiltersOpen((o) => !o)}
        hasActiveFilters={hasFilters}
      />
    );
    return () => setFilesTopBarChrome(null);
  }, [
    setFilesTopBarChrome,
    allFilesFlatLanding,
    filterState.search,
    handleSearchChange,
    quickFiltersOpen,
    hasFilters,
  ]);

  const visibleLinkedDrives = filterLinkedDrivesByPowerUp(linkedDrives, {
    hasEditor,
    hasGallerySuite,
  });
  const linkedDrivesForBulkMove = useMemo(
    () => filterLinkedDrivesForMoveTargets(visibleLinkedDrives),
    [visibleLinkedDrives]
  );
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
  const pinnedFolderItems = useMemo(
    () =>
      mergePinnedFolderItems(
        folderItems,
        pinnedFolderIds,
        pinnedFolderLabels,
        linkedDrives,
        teamAwareDriveName
      ),
    [folderItems, pinnedFolderIds, pinnedFolderLabels, linkedDrives]
  );

  const storageDisplayContext = useMemo(() => {
    if (typeof pathname === "string" && pathname.startsWith("/enterprise")) {
      return { locationScope: "enterprise" as const };
    }
    if (typeof pathname === "string" && /^\/team\//.test(pathname)) {
      return { locationScope: "team" as const };
    }
    return { locationScope: "personal" as const };
  }, [pathname]);

  const filePreviewRawLut = useFilePreviewModalRawLut(previewFile, linkedDrives);

  const loadDriveFiles = useCallback(
    async (
      driveId: string,
      options?: {
        silent?: boolean;
        storageParentOverride?: string | null;
        /** When Storage is v2 but we open via legacy `path=` (e.g. Google migration home tiles). */
        v2VirtualPathPrefix?: string | null;
      }
    ) => {
      const gen = ++loadDriveFilesGenRef.current;
      if (!options?.silent) setDriveFilesLoading(true);
      const parent =
        options && "storageParentOverride" in options
          ? options.storageParentOverride ?? null
          : storageParentFolderId;
      const optVirtRaw =
        options && "v2VirtualPathPrefix" in options && options.v2VirtualPathPrefix != null
          ? String(options.v2VirtualPathPrefix).replace(/^\/+/, "")
          : "";
      try {
        const meta = linkedDrives.find((d) => d.id === driveId);
        const storageV2 = isStorageFoldersV2PillarDrive(meta);
        const inferredVirt =
          !parent && storageV2
            ? (currentDrivePath ?? "").replace(/^\/+/, "")
            : "";
        const v2VirtualPrefix = optVirtRaw || inferredVirt;
        if (storageV2 && v2VirtualPrefix && !parent) {
          if (gen !== loadDriveFilesGenRef.current) return;
          setStorageFolderListError(null);
          setV2StorageSubfolders([]);
          setStorageContextFolderVersion(null);
          const { files, listTruncated } = await fetchDriveFiles(driveId);
          if (gen !== loadDriveFilesGenRef.current) return;
          setDriveFiles(files);
          setDriveListTruncated(listTruncated);
        } else if (storageV2) {
          const { folders, files, listError } = await fetchStorageFolderList(
            driveId,
            parent,
            meta?.name ?? ""
          );
          if (gen !== loadDriveFilesGenRef.current) return;
          setStorageFolderListError(listError);
          if (listError) {
            setDriveFiles([]);
            setDriveListTruncated(false);
            setV2StorageSubfolders([]);
            setStorageContextFolderVersion(null);
          } else {
            setDriveFiles(files);
            setDriveListTruncated(false);
            setV2StorageSubfolders(
              folders.map((f) => {
                const v2FolderLocked =
                  f.system_folder_role === "transfers_root" || f.protected_deletion === true;
                return {
                  name: f.name,
                  type: "folder" as const,
                  key: buildStorageV2FolderPinId(driveId, f.id),
                  items: f.item_count,
                  virtualFolder: true,
                  driveId,
                  storageFolderId: f.id,
                  storageLinkedDriveId: driveId,
                  storageFolderVersion: f.version,
                  storageFolderOperationState: f.operation_state,
                  storageFolderLifecycleState: f.lifecycle_state,
                  hideShare: true,
                  ...(typeof f.system_folder_role === "string" && f.system_folder_role.trim()
                    ? { systemFolderRole: f.system_folder_role.trim() }
                    : {}),
                  ...(v2FolderLocked
                    ? { preventDelete: true, preventMove: true, preventRename: true }
                    : {}),
                  ...(f.cover_file
                    ? {
                        coverFile: {
                          objectKey: f.cover_file.object_key,
                          fileName: f.cover_file.file_name,
                          contentType: f.cover_file.content_type,
                        },
                      }
                    : {}),
                };
              })
            );
            if (parent) {
              void (async () => {
                try {
                  const token = await getAuthToken();
                  if (!token) return;
                  const r = await fetch(`/api/storage-folders/${encodeURIComponent(parent)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (gen !== loadDriveFilesGenRef.current) return;
                  if (r.ok) {
                    const j = (await r.json()) as { version?: unknown };
                    if (gen !== loadDriveFilesGenRef.current) return;
                    const v = typeof j.version === "number" ? j.version : Number(j.version ?? NaN);
                    if (Number.isFinite(v)) setStorageContextFolderVersion(v);
                    else setStorageContextFolderVersion(null);
                  } else {
                    setStorageContextFolderVersion(null);
                  }
                } catch {
                  if (gen === loadDriveFilesGenRef.current) setStorageContextFolderVersion(null);
                }
              })();
            } else {
              setStorageContextFolderVersion(null);
            }
          }
        } else {
          if (gen !== loadDriveFilesGenRef.current) return;
          setStorageFolderListError(null);
          setV2StorageSubfolders([]);
          const { files, listTruncated } = await fetchDriveFiles(driveId);
          if (gen !== loadDriveFilesGenRef.current) return;
          setDriveFiles(files);
          setDriveListTruncated(listTruncated);
        }
      } catch {
        if (gen !== loadDriveFilesGenRef.current) return;
        setDriveFiles([]);
        setV2StorageSubfolders([]);
        setStorageFolderListError("Could not load this folder.");
        setDriveListTruncated(false);
      } finally {
        if (gen === loadDriveFilesGenRef.current) {
          setDriveFilesLoading(false);
        }
      }
    },
    [fetchDriveFiles, linkedDrives, storageParentFolderId, currentDrivePath]
  );

  const handleV2StorageFolderMutated = useCallback(() => {
    if (!currentDrive) return;
    void loadDriveFiles(currentDrive.id);
    void refetch();
  }, [currentDrive, loadDriveFiles, refetch]);

  const openDrive = useCallback(
    (id: string, name: string, pathInsideDrive = "", storageParent?: string | null) => {
      recordRecentOpen("folder", id, getAuthToken);
      setCurrentFolderDriveId(id);
      setCurrentDrive({ id, name });
      const normPath = pathInsideDrive.replace(/^\/+/, "");
      setCurrentDrivePath(normPath);
      const sp = storageParent === undefined ? null : storageParent ?? null;
      setStorageParentFolderId(sp);
      void loadDriveFiles(id, {
        storageParentOverride: sp,
        ...(sp == null && normPath ? { v2VirtualPathPrefix: normPath } : {}),
      });
      setSelectedFileIds(new Set());
      setSelectedFolderKeys(new Set());
      if (isBizziCloudBaseDrive(name)) {
        clearFiltersAndKeepDrive(id);
      }
    },
    [
      loadDriveFiles,
      setCurrentFolderDriveId,
      setCurrentDrivePath,
      setStorageParentFolderId,
      clearFiltersAndKeepDrive,
    ]
  );

  const openFolderFromPin = useCallback(
    (item: FolderItem) => {
      if (!item.driveId) return;
      const driveMeta = linkedDrives.find((d) => d.id === item.driveId);
      const displayName = driveMeta?.name ?? item.name;
      if (item.storageFolderId) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("drive", item.driveId);
        sp.set("folder", item.storageFolderId);
        sp.delete("path");
        const q = sp.toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
        openDrive(item.driveId, displayName, "", item.storageFolderId);
        return;
      }
      openDrive(item.driveId, displayName);
    },
    [linkedDrives, openDrive, pathname, router, searchParams]
  );

  const navigateIntoStorageSubfolder = useCallback(
    (item: FolderItem) => {
      if (!item.storageFolderId || !currentDrive) return;
      setStorageUploadFolderLabel(item.name?.trim() || null);
      setCurrentDrivePath("");
      setStorageContextFolderVersion(
        item.storageFolderVersion != null && Number.isFinite(item.storageFolderVersion)
          ? item.storageFolderVersion
          : null
      );
      setSelectedFileIds(new Set());
      setSelectedFolderKeys(new Set());
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("drive", currentDrive.id);
      sp.set("folder", item.storageFolderId);
      sp.delete("path");
      const q = sp.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      /** Single load: URL sync effect applies `folder=` and calls loadDriveFiles (avoid duplicate with explicit load). */
    },
    [currentDrive, searchParams, pathname, router, setCurrentDrivePath, setStorageUploadFolderLabel]
  );

  const closeDrive = useCallback(() => {
    setCurrentFolderDriveId(null);
    setCurrentDrive(null);
    setCurrentDrivePath("");
    setStorageParentFolderId(null);
    setStorageUploadFolderLabel(null);
    setDriveFiles([]);
    setV2StorageSubfolders([]);
    setV2FolderBreadcrumb("");
    setDriveListTruncated(false);
    setStorageFolderListError(null);
    setStorageUpgradeError(null);
    setStorageContextFolderVersion(null);
    setStoragePathCreateOpen(false);
    setStoragePathRenameOpen(false);
    setStoragePathMoveOpen(false);
    setSelectedFileIds(new Set());
    setSelectedFolderKeys(new Set());
  }, [
    setCurrentFolderDriveId,
    setCurrentDrivePath,
    setStorageParentFolderId,
    setStorageUploadFolderLabel,
  ]);

  const clearFlatFilesUrlAndDrive = useCallback(() => {
    closeDrive();
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("drive");
    sp.delete("folder");
    sp.delete("path");
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [closeDrive, searchParams, pathname, router]);

  const currentDriveMeta = currentDrive
    ? linkedDrives.find((d) => d.id === currentDrive.id)
    : undefined;
  const driveBaseName = currentDriveMeta
    ? teamAwareDriveName(currentDriveMeta.name)
    : "";
  /** All Files: show Recents/Hearts/Storage while at root or when browsing the Storage drive only (hide for RAW/Gallery deep links). */
  const showFilesLandingTabBar = threeTabFilesLanding
    ? !currentDrive ||
      (driveBaseName === "Storage" && currentDriveMeta?.is_creator_raw !== true)
    : !currentDrive;
  const isGalleryMediaDrive = !!currentDriveMeta && driveBaseName === "Gallery Media";
  const isPathTreeDrive =
    !!currentDrive &&
    (isGalleryMediaDrive ||
      driveBaseName === "Storage" ||
      currentDriveMeta?.is_creator_raw === true);

  const storageV2PathPrefixNorm = (currentDrivePath ?? "").replace(/^\/+/, "");
  const isStorageV2VirtualPathMode =
    !!currentDrive &&
    !!currentDriveMeta &&
    isStorageFoldersV2PillarDrive(currentDriveMeta) &&
    !!storageV2PathPrefixNorm &&
    storageParentFolderId == null;

  const isStorageV2FolderBrowse =
    !!currentDrive &&
    !!currentDriveMeta &&
    isStorageFoldersV2PillarDrive(currentDriveMeta) &&
    !isStorageV2VirtualPathMode;

  const isStorageLegacyVirtualBrowse =
    !!currentDrive &&
    !!currentDriveMeta &&
    driveBaseName === "Storage" &&
    currentDriveMeta.is_creator_raw !== true &&
    !isLinkedDriveFolderModelV2(currentDriveMeta);

  const galleryUsesLegacyVirtualPaths =
    isGalleryMediaDrive &&
    !!currentDriveMeta &&
    !isLinkedDriveFolderModelV2(currentDriveMeta);

  const browseStorageByVirtualPaths =
    !!currentDrive &&
    (galleryUsesLegacyVirtualPaths ||
      currentDriveMeta?.is_creator_raw === true ||
      (driveBaseName === "Storage" && !isLinkedDriveFolderModelV2(currentDriveMeta)) ||
      isStorageV2VirtualPathMode);

  const enableStorageNestedFolders = useCallback(async () => {
    if (!currentDrive) return;
    setStorageUpgradeError(null);
    setStorageV2MigrateLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setStorageUpgradeError("Sign in again to update Storage.");
        return;
      }
      const res = await fetch(`/api/linked-drives/${currentDrive.id}/folder-model`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "enable_v2", migrate: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStorageUpgradeError(data.error ?? "Could not update Storage.");
        return;
      }
      bumpStorageVersion();
      await fetchDrives();
      setCurrentDrivePath("");
      setStorageParentFolderId(null);
      setStorageUploadFolderLabel(null);
      setStorageContextFolderVersion(null);
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("drive", currentDrive.id);
      sp.delete("folder");
      sp.delete("path");
      const q = sp.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      await loadDriveFiles(currentDrive.id, { storageParentOverride: null });
    } finally {
      setStorageV2MigrateLoading(false);
    }
  }, [
    bumpStorageVersion,
    currentDrive,
    fetchDrives,
    loadDriveFiles,
    pathname,
    router,
    searchParams,
    setCurrentDrivePath,
    setStorageParentFolderId,
    setStorageUploadFolderLabel,
  ]);

  /**
   * Single-segment title in the Storage header (drive name at root, or only the folder you are in).
   * Uses the last name from `getStorageFolderAncestors` output (any depth — no path length limit in UI).
   * Falls back to `storageUploadFolderLabel` while the ancestors request catches up after navigation.
   */
  const storagePathMenuLabel = useMemo(() => {
    if (!currentDrive || !isStorageV2FolderBrowse) return "";
    const base = teamAwareDriveName(currentDriveMeta?.name ?? currentDrive.name);
    const segments = v2FolderBreadcrumb.trim().split(/\s*\/\s*/).filter(Boolean);
    if (segments.length > 0) return segments[segments.length - 1]!;
    if (storageParentFolderId && storageUploadFolderLabel?.trim()) {
      return storageUploadFolderLabel.trim();
    }
    return base;
  }, [
    currentDrive,
    currentDriveMeta,
    isStorageV2FolderBrowse,
    v2FolderBreadcrumb,
    storageParentFolderId,
    storageUploadFolderLabel,
  ]);

  /** Full path for share default name / tooltips where the whole trail is useful. */
  const storagePathFullLabel = useMemo(() => {
    if (!currentDrive || !isStorageV2FolderBrowse) return "";
    const base = teamAwareDriveName(currentDriveMeta?.name ?? currentDrive.name);
    return v2FolderBreadcrumb.trim() ? `${base} / ${v2FolderBreadcrumb}` : base;
  }, [currentDrive, currentDriveMeta, isStorageV2FolderBrowse, v2FolderBreadcrumb]);

  const storageMenuFolderPinned = useMemo(() => {
    if (!currentDrive || !isStorageV2FolderBrowse) return false;
    if (storageParentFolderId) {
      return isPinned("folder", buildStorageV2FolderPinId(currentDrive.id, storageParentFolderId));
    }
    return isPinned("folder", currentDrive.id);
  }, [currentDrive, isStorageV2FolderBrowse, storageParentFolderId, isPinned]);

  const openStoragePathShare = useCallback(() => {
    if (!currentDrive) return;
    setShareFolderName(storagePathFullLabel || currentDrive.name);
    setShareDriveId(currentDrive.id);
    setShareReferencedFileIds([]);
    setShareInitialData(null);
    setShareModalOpen(true);
  }, [currentDrive, storagePathFullLabel]);

  const toggleStoragePathPin = useCallback(async () => {
    if (!currentDrive || !isStorageV2FolderBrowse) return;
    const base = teamAwareDriveName(currentDriveMeta?.name ?? currentDrive.name);
    const lastName = storageParentFolderId ? storagePathMenuLabel : base;
    if (storageParentFolderId) {
      const pid = buildStorageV2FolderPinId(currentDrive.id, storageParentFolderId);
      if (storageMenuFolderPinned) await unpinItem("folder", pid);
      else await pinItem("folder", pid, { displayLabel: lastName });
    } else {
      if (storageMenuFolderPinned) await unpinItem("folder", currentDrive.id);
      else await pinItem("folder", currentDrive.id, { displayLabel: base });
    }
    await refetchPinned();
  }, [
    currentDrive,
    currentDriveMeta,
    isStorageV2FolderBrowse,
    storageParentFolderId,
    storageMenuFolderPinned,
    storagePathMenuLabel,
    pinItem,
    unpinItem,
    refetchPinned,
  ]);

  const storageRenameCurrentName = isStorageV2FolderBrowse
    ? storagePathMenuLabel
    : teamAwareDriveName(currentDriveMeta?.name ?? currentDrive?.name ?? "");

  useEffect(() => {
    if (!isStorageV2FolderBrowse || !storageParentFolderId || !currentDrive) {
      setV2FolderBreadcrumb("");
      setStorageUploadFolderLabel(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;
        const res = await fetch(
          `/api/storage-folders/ancestors?folder_id=${encodeURIComponent(storageParentFolderId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          ancestors?: Array<{ id: string; name: string }>;
        };
        const list = data.ancestors ?? [];
        const label = list
          .map((x) => x.name)
          .filter(Boolean)
          .join(" / ");
        if (!cancelled) {
          setV2FolderBreadcrumb(label);
          const names = list.map((x) => x.name).filter(Boolean);
          setStorageUploadFolderLabel(
            names.length > 0 ? names[names.length - 1]! : null
          );
        }
      } catch {
        if (!cancelled) {
          setV2FolderBreadcrumb("");
          setStorageUploadFolderLabel(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isStorageV2FolderBrowse,
    storageParentFolderId,
    currentDrive,
    storageVersion,
    setStorageUploadFolderLabel,
  ]);

  const { subfolderItems, displayedFiles } = useMemo(() => {
    if (!currentDrive) {
      return { subfolderItems: [] as FolderItem[], displayedFiles: driveFiles };
    }
    if (isStorageV2FolderBrowse) {
      return { subfolderItems: v2StorageSubfolders, displayedFiles: driveFiles };
    }
    if (!browseStorageByVirtualPaths) {
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
          driveId: currentDrive.id,
          virtualFolder: true,
          hideShare: true,
          preventRename: true,
          pathPrefix: `${currentDrivePath}/${segment}`,
        })
      );
      return { subfolderItems: nestedSubfolders, displayedFiles: directFiles };
    }
    const galleryTitleMap = new Map(galleries.map((g) => [g.id, g.title]));
    const seen = new Map<
      string,
      {
        count: number;
        displayName: string;
        storageRoot?: string;
        galleryMediaCanonicalId?: string;
      }
    >();
    for (const f of driveFiles) {
      const parts = f.path.split("/").filter(Boolean);
      if (parts.length < 2) continue;
      if (isGalleryMediaDrive) {
        const canonicalId = canonicalGalleryIdForGalleryMediaPath(
          f.path,
          f.galleryId ?? null,
          galleryMediaPathSegmentIndex
        );
        const storageRoot = galleryMediaStorageRootForCanonicalId(canonicalId, galleries);
        const displayName = galleryTitleMap.get(canonicalId) ?? canonicalId;
        const cur = seen.get(canonicalId);
        if (cur) {
          seen.set(canonicalId, { ...cur, count: cur.count + 1 });
        } else {
          seen.set(canonicalId, {
            count: 1,
            displayName,
            storageRoot,
            galleryMediaCanonicalId: canonicalId,
          });
        }
      } else {
        const folderKey = parts[0];
        const displayName = folderKey;
        const cur = seen.get(folderKey);
        if (cur) {
          seen.set(folderKey, { ...cur, count: cur.count + 1 });
        } else {
          seen.set(folderKey, { count: 1, displayName });
        }
      }
    }
    const subfolderList: FolderItem[] = Array.from(seen.entries()).map(([folderKey, v]) => ({
      name: v.displayName,
      type: "folder" as const,
      key: `path-subfolder-${currentDrive.id}|${folderKey}`,
      items: v.count,
      driveId: currentDrive.id,
      virtualFolder: true,
      hideShare: true,
      preventRename: true,
      pathPrefix: isGalleryMediaDrive ? (v.storageRoot ?? folderKey) : folderKey,
      galleryMediaCanonicalId: v.galleryMediaCanonicalId,
    }));
    const rootFiles = driveFiles.filter((f) => !f.path.includes("/"));
    return { subfolderItems: subfolderList, displayedFiles: rootFiles };
  }, [
    currentDrive,
    isStorageV2FolderBrowse,
    browseStorageByVirtualPaths,
    v2StorageSubfolders,
    driveFiles,
    currentDrivePath,
    isGalleryMediaDrive,
    galleries,
    galleryMediaPathSegmentIndex,
  ]);

  const virtualFolderRollupByKey = useMemo(() => {
    const map = new Map<string, { descendants: RecentFile[]; coverage: FolderRollupCoverage }>();
    if (!currentDrive || !browseStorageByVirtualPaths || isStorageV2FolderBrowse) return map;
    const coverage: FolderRollupCoverage = driveListTruncated ? "partial" : "full";
    for (const item of subfolderItems) {
      if (!item.virtualFolder || item.pathPrefix == null) continue;
      const descendants = filterFilesForVirtualFolder(driveFiles, item.pathPrefix ?? "", {
        isGalleryMediaDrive,
        currentDrivePath,
        galleryMediaCanonicalId: item.galleryMediaCanonicalId ?? null,
        galleryMediaPathSegmentIndex,
      });
      map.set(item.key, { descendants, coverage });
    }
    return map;
  }, [
    currentDrive,
    browseStorageByVirtualPaths,
    isStorageV2FolderBrowse,
    subfolderItems,
    driveFiles,
    driveListTruncated,
    isGalleryMediaDrive,
    currentDrivePath,
    galleryMediaPathSegmentIndex,
  ]);

  const handleDeleteSubfolderItem = useCallback(
    async (item: FolderItem) => {
      if (item.preventDelete) return;
      const rowDriveId = item.driveId ?? item.storageLinkedDriveId ?? currentDrive?.id ?? "";
      try {
        if (item.storageFolderId) {
          const ok = await confirm({
            message: `Delete "${item.name}" and everything inside it? Files will move to trash.`,
            destructive: true,
          });
          if (!ok) return;
          await trashStorageFolderSubtree(
            item.storageFolderId,
            typeof item.storageFolderVersion === "number" ? item.storageFolderVersion : undefined
          );
        } else if (item.virtualFolder && item.pathPrefix && rowDriveId) {
          const ok = await confirm({
            message: `Delete "${item.name}" and all files inside? They will move to trash.`,
            destructive: true,
          });
          if (!ok) return;
          await trashAllFilesUnderStoragePath(rowDriveId, item.pathPrefix);
        } else if (item.driveId) {
          const drive = linkedDrives.find((d) => d.id === item.driveId);
          if (!drive) return;
          const msg =
            item.items === 0
              ? `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`
              : `Delete "${item.name}"? The folder and its ${item.items} file${item.items === 1 ? "" : "s"} will be moved to trash.`;
          const ok = await confirm({ message: msg, destructive: true });
          if (!ok) return;
          await deleteFolder(drive, item.items);
        } else {
          return;
        }
        if (currentDrive) await loadDriveFiles(currentDrive.id);
        await refetch();
        await refetchPinned();
      } catch (e) {
        console.error(e);
      }
    },
    [
      confirm,
      currentDrive,
      deleteFolder,
      linkedDrives,
      loadDriveFiles,
      refetch,
      refetchPinned,
      trashAllFilesUnderStoragePath,
      trashStorageFolderSubtree,
    ]
  );

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

  /** All Files inline: Recents tab lists Storage uploads (7 days), not the flat filter API. */
  const filesLandingRecentsMode = threeTabFilesLanding && filesLandingTab === "recents";
  const rootRecentsFilesForGrid = filesLandingRecentsMode ? recentUploads : filesToShow;

  useEffect(() => {
    if (!threeTabFilesLanding || filesLandingTab !== "recents") return;
    void fetchRecentUploads();
  }, [threeTabFilesLanding, filesLandingTab, fetchRecentUploads]);

  const showFolders = !useFilteredScoped;

  const bulkV2IntraEligible = useMemo(() => {
    if (!isStorageV2FolderBrowse || !currentDrive) return false;
    if (useFilteredScoped) return false;
    if (selectedFolderKeys.size !== 0) return false;
    if (selectedFileIds.size === 0) return false;
    const fid = currentDrive.id;
    for (const id of selectedFileIds) {
      const file = displayedFilesWithMacosPackages.find((f) => f.id === id);
      if (!file?.driveId || file.driveId !== fid) return false;
    }
    return true;
  }, [
    isStorageV2FolderBrowse,
    currentDrive,
    useFilteredScoped,
    selectedFolderKeys,
    selectedFileIds,
    displayedFilesWithMacosPackages,
  ]);

  // Refresh drive files when storage changes (e.g. after upload) so UI updates in real time.
  // Use silent: true to avoid loading flash - keep current content visible during background refetch.
  useEffect(() => {
    if (currentDrive && storageVersion > 0) {
      loadDriveFiles(currentDrive.id, { silent: true });
    }
  }, [storageVersion, currentDrive, loadDriveFiles]);

  // Refresh when Uppy finalizes each storage file (debounced) — same channel as Recent uploads.
  useEffect(() => {
    const handler = (ev: Event) => {
      if (!currentDrive) return;
      const detail = (ev as CustomEvent<StorageUploadCompleteDetail | undefined>).detail;
      if (detail?.driveId != null && detail.driveId !== currentDrive.id) return;
      loadDriveFiles(currentDrive.id, { silent: true });
    };
    window.addEventListener(STORAGE_UPLOAD_COMPLETE_EVENT, handler);
    return () => window.removeEventListener(STORAGE_UPLOAD_COMPLETE_EVENT, handler);
  }, [currentDrive, loadDriveFiles]);

  // Real-time subscription: mount uploads appear in web app without refresh
  useEffect(() => {
    if (!currentDrive) {
      setDriveFiles([]);
      return;
    }
    const meta = linkedDrives.find((d) => d.id === currentDrive.id);
    const v2Pillar = isStorageFoldersV2PillarDrive(meta);
    const pathNorm = (currentDrivePath ?? "").replace(/^\/+/, "");
    const v2VirtualPathBrowse =
      v2Pillar && !!pathNorm && storageParentFolderId == null;
    if (v2Pillar && !v2VirtualPathBrowse) {
      return () => {};
    }
    return subscribeToDriveFiles(currentDrive.id, setDriveFiles);
  }, [
    currentDrive,
    linkedDrives,
    subscribeToDriveFiles,
    currentDrivePath,
    storageParentFolderId,
  ]);

  // Fetch pinned file details when pinned file IDs change
  const loadPinnedFiles = useCallback(async () => {
    const ids = Array.from(pinnedFileIds);
    if (ids.length === 0) {
      setPinnedFiles([]);
      return;
    }
    try {
      const files = await fetchPinnedFiles(ids);
      setPinnedFiles(files);
    } catch {
      setPinnedFiles([]);
    }
  }, [pinnedFileIds]);

  useEffect(() => {
    loadPinnedFiles();
  }, [loadPinnedFiles]);

  // Open drive from URL query when navigating from Home (e.g. /dashboard/files?drive=id&path=segment)
  // Also when drive in URL differs from current (e.g. deep link or toolbar drive change)
  useEffect(() => {
    const driveId = searchParams.get("drive");
    if (!driveId) return;
    const folder = visibleDriveFolders.find((d) => d.id === driveId);
    if (!folder) return;
    const pathFromUrl = searchParams.get("path")?.trim() ?? "";
    const normalizedPath = pathFromUrl.replace(/^\/+/, "");
    const meta = linkedDrives.find((d) => d.id === driveId);
    const isPillarV2 = isStorageFoldersV2PillarDrive(meta);
    const folderIdFromUrl = (searchParams.get("folder") ?? "").trim() || null;

    const shouldOpen = !currentDrive || currentDrive.id !== driveId;
    if (shouldOpen) {
      if (isPillarV2) {
        openDrive(
          driveId,
          folder.name,
          folderIdFromUrl ? "" : normalizedPath,
          folderIdFromUrl
        );
      } else {
        openDrive(driveId, folder.name, normalizedPath);
      }
      if (isBizziCloudBaseDrive(folder.name)) {
        clearFiltersAndKeepDrive(driveId);
      }
    } else if (currentDrive.id === driveId) {
      if (isPillarV2) {
        const nextParent = folderIdFromUrl;
        const pathNorm = normalizedPath;
        const pathChanged = pathNorm !== (currentDrivePath ?? "").replace(/^\/+/, "");
        const parentChanged = nextParent !== storageParentFolderId;
        if (parentChanged) {
          setStorageParentFolderId(nextParent);
          if (nextParent) setCurrentDrivePath("");
          void loadDriveFiles(driveId, {
            storageParentOverride: nextParent,
            ...(nextParent == null && pathNorm
              ? { v2VirtualPathPrefix: pathNorm }
              : {}),
          });
        } else if (!nextParent && pathChanged) {
          setCurrentDrivePath(pathNorm);
          void loadDriveFiles(driveId, {
            storageParentOverride: null,
            v2VirtualPathPrefix: pathNorm || undefined,
          });
        }
      } else if (normalizedPath !== currentDrivePath) {
        setCurrentDrivePath(normalizedPath);
        void loadDriveFiles(driveId);
        if (isBizziCloudBaseDrive(folder.name)) {
          clearFiltersAndKeepDrive(driveId);
        }
      }
    }
  }, [
    searchParams,
    currentDrive,
    currentDrivePath,
    storageParentFolderId,
    linkedDrives,
    visibleDriveFolders,
    openDrive,
    clearFiltersAndKeepDrive,
    setCurrentDrivePath,
    setStorageParentFolderId,
    loadDriveFiles,
  ]);

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

  const openUploadFromEmptyState = useCallback(async () => {
    clearFileUploadError();
    if (isEnterpriseFilesNoDrive) return;
    const resolved = await resolveUploadDestination({
      pathname,
      searchParams,
      currentDriveId: currentDriveId ?? null,
      currentDrivePath: currentDrivePath ?? "",
      linkedDrives,
      sourceSurface: "filegrid_empty_state",
      isEnterpriseFilesNoDrive,
      isGalleryMediaDrive: false,
      getOrCreateStorageDrive: async () => {
        const d = await getOrCreateStorageDrive();
        return { id: d.id, name: d.name };
      },
    });
    if (!resolved.success) {
      setFileUploadErrorMessage(resolved.userMessage);
      return;
    }
    let driveId = resolved.driveId;
    let workspaceId: string | null = null;
    const panelOptionsBase = {
      uploadIntent: resolved.uploadIntent,
      lockedDestination: resolved.isLocked,
      sourceSurface: resolved.sourceSurface,
      destinationMode: resolved.destinationMode,
      routeContext: resolved.routeContext,
      targetDriveName: resolved.driveName,
      resolvedBy: resolved.resolvedBy,
      driveName: resolved.driveName,
    };

    if ((pathname.startsWith("/enterprise") || pathname.startsWith("/desktop")) && org?.id) {
      try {
        const token = await user?.getIdToken();
        if (!token) return;
        const params = new URLSearchParams({
          drive_id: driveId,
          organization_id: org.id,
        });
        if (selectedWorkspaceId) params.set("workspace_id", selectedWorkspaceId);
        const res = await fetch(`/api/workspaces/default-for-drive?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err.error as string) ?? "Could not resolve workspace");
        }
        const data = (await res.json()) as {
          workspace_id: string;
          drive_id: string;
          drive_name?: string;
          workspace_name?: string;
          scope_label?: string;
        };
        workspaceId = data.workspace_id;
        driveId = data.drive_id ?? driveId;
        uppyUpload?.openPanel(driveId, resolved.pathPrefix, workspaceId, {
          ...panelOptionsBase,
          driveName: data.drive_name ?? panelOptionsBase.driveName,
          workspaceName: data.workspace_name ?? null,
          scopeLabel: data.scope_label ?? null,
          storageFolderId: storageParentFolderId,
          storageFolderDisplayName: storageUploadFolderLabel,
        });
        return;
      } catch (err) {
        console.error("Workspace resolve failed:", err);
        setFileUploadErrorMessage("Could not resolve workspace for upload. Try again.");
        return;
      }
    }

    uppyUpload?.openPanel(driveId, resolved.pathPrefix, null, {
      ...panelOptionsBase,
      storageFolderId: storageParentFolderId,
      storageFolderDisplayName: storageUploadFolderLabel,
    });
  }, [
    clearFileUploadError,
    currentDriveId,
    currentDrivePath,
    getOrCreateStorageDrive,
    isEnterpriseFilesNoDrive,
    linkedDrives,
    org?.id,
    pathname,
    searchParams,
    selectedWorkspaceId,
    setFileUploadErrorMessage,
    storageParentFolderId,
    storageUploadFolderLabel,
    uppyUpload,
    user,
  ]);

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
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[aria-modal="true"]')) {
        setDragState(null);
        return;
      }
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
        const v2pin = parseStorageV2FolderPinId(key);
        if (v2pin) {
          const hit =
            subfolderItems.find((x) => x.key === key) ??
            folderItems.find((x) => x.key === key) ??
            pinnedFolderItems.find((x) => x.key === key);
          await trashStorageFolderSubtree(
            v2pin.storageFolderId,
            typeof hit?.storageFolderVersion === "number" ? hit.storageFolderVersion : undefined
          );
          continue;
        }
        const virt = parseStorageVirtualFolderKey(key);
        if (virt) {
          await trashAllFilesUnderStoragePath(virt.driveId, virt.pathPrefix);
          continue;
        }
        const pathHit = subfolderItems.find((x) => x.key === key);
        if (pathHit?.virtualFolder && pathHit.pathPrefix) {
          const did = pathHit.driveId ?? currentDrive?.id;
          if (did) {
            await trashAllFilesUnderStoragePath(did, pathHit.pathPrefix);
            continue;
          }
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
      if (
        currentDrive &&
        !didUnlinkCurrentDrive &&
        (allFileIdsToDelete.length > 0 || folderKeys.length > 0)
      ) {
        loadDriveFiles(currentDrive.id);
      }
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  }, [
    selectedFileIds,
    selectedFolderKeys,
    subfolderItems,
    folderItems,
    pinnedFolderItems,
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
    trashAllFilesUnderStoragePath,
    trashStorageFolderSubtree,
  ]);

  const handleBulkMove = useCallback(() => {
    setMoveModalOpen(true);
  }, []);

  const DROP_FOLDER_INTO_V2_SUBFOLDER_UNSUPPORTED =
    "Moving that folder here isn’t supported via drag-and-drop. Use Move in the toolbar instead.";

  const resolveFolderItemByKey = useCallback(
    (key: string): FolderItem | undefined =>
      subfolderItems.find((x) => x.key === key) ??
      folderItems.find((x) => x.key === key) ??
      pinnedFolderItems.find((x) => x.key === key),
    [subfolderItems, folderItems, pinnedFolderItems]
  );

  const performMove = useCallback(
    async (fileIds: string[], folderKeys: string[], target: FolderDropMoveTarget) => {
      try {
        setMoveErrorNotice(null);
        const expandedIds = expandMacosPackageRowIds(fileIds, filesForPackageExpand, packagesForPackageExpand);
        const targetStorageFolderId = target.storageFolderId;

        if (typeof targetStorageFolderId === "string" && targetStorageFolderId.length > 0) {
          if (expandedIds.length > 0) {
            await moveFilesToStorageFolder(expandedIds, targetStorageFolderId);
          }
          for (const key of folderKeys) {
            const item = resolveFolderItemByKey(key);
            if (item?.storageFolderId != null && item.storageFolderVersion != null) {
              if (item.storageFolderId === targetStorageFolderId) {
                throw new Error(MOVE_ALREADY_AT_DESTINATION);
              }
              await moveStorageFolder(
                item.storageFolderId,
                targetStorageFolderId,
                item.storageFolderVersion
              );
              continue;
            }
            const scope = parseStorageVirtualFolderKey(key);
            if (scope) {
              const ids = await getFileIdsForBulkShare([], [], [scope]);
              if (ids.length > 0) {
                await moveFilesToStorageFolder(ids, targetStorageFolderId);
              }
              continue;
            }
            const driveKeyId = key.startsWith("drive-") ? key.slice(6) : key;
            if (linkedDrives.some((d) => d.id === driveKeyId)) {
              const ids = await getFileIdsForBulkShare([], [driveKeyId], undefined);
              if (ids.length > 0) {
                await moveFilesToStorageFolder(ids, targetStorageFolderId);
              }
              continue;
            }
            throw new Error(DROP_FOLDER_INTO_V2_SUBFOLDER_UNSUPPORTED);
          }
          clearSelection();
          setMoveNotice("Items moved into the folder");
          void refetch();
          return;
        }

        const targetDriveId = target.driveId;
        if (expandedIds.length > 0) {
          await moveFilesToFolder(expandedIds, targetDriveId);
        }
        for (const key of folderKeys) {
          const driveId = key.startsWith("drive-") ? key.slice(6) : key;
          if (driveId === targetDriveId) {
            throw new Error(MOVE_ALREADY_AT_DESTINATION);
          }
          const drive = linkedDrives.find((d) => d.id === driveId);
          if (drive) {
            await moveFolderContentsToFolder(driveId, targetDriveId);
            if (currentDriveId === driveId) {
              closeDrive();
            }
          }
        }
        clearSelection();
        const destName = linkedDrives.find((d) => d.id === targetDriveId)?.name ?? "folder";
        setMoveNotice(`Items moved into the "${destName}" folder`);
        void refetch();
      } catch (e) {
        setMoveNotice(null);
        setMoveErrorNotice(e instanceof Error ? e.message : "Move failed");
        throw e;
      }
    },
    [
      linkedDrives,
      currentDriveId,
      closeDrive,
      moveFilesToFolder,
      moveFilesToStorageFolder,
      moveStorageFolder,
      moveFolderContentsToFolder,
      clearSelection,
      refetch,
      filesForPackageExpand,
      packagesForPackageExpand,
      resolveFolderItemByKey,
      getFileIdsForBulkShare,
    ]
  );

  const handleBulkMoveConfirm = useCallback(
    async (targetDriveId: string) => {
      try {
        await performMove(Array.from(selectedFileIds), Array.from(selectedFolderKeys), {
          driveId: targetDriveId,
        });
        setMoveModalOpen(false);
      } catch {
        /* moveErrorNotice set in performMove */
      }
    },
    [selectedFileIds, selectedFolderKeys, performMove]
  );

  const handleDropOnFolder = useCallback(
    async (target: FolderDropMoveTarget, e: React.DragEvent) => {
      const parsed = getDragMovePayload(e.dataTransfer);
      if (!parsed) return;
      try {
        await performMove(parsed.fileIds, parsed.folderKeys, target);
      } catch {
        /* moveErrorNotice set in performMove */
      }
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
    const { folderDriveIds, storagePathScopes, storageV2FolderScopes } =
      bulkShareArgsFromFolderKeys(folderKeys);

    try {
      const allFileIds = await getFileIdsForBulkShare(
        fileIds,
        folderDriveIds,
        storagePathScopes.length > 0 ? storagePathScopes : undefined,
        storageV2FolderScopes.length > 0 ? storageV2FolderScopes : undefined
      );
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

  const filesPageStorageEmbeddedChrome =
    threeTabFilesLanding &&
    filesLandingTab === "storage" &&
    (!currentDrive ||
      (driveBaseName === "Storage" && currentDriveMeta?.is_creator_raw !== true));
  const embeddedFolderBrowse = Boolean(
    (embeddedHomeStorage && currentDrive) ||
      (threeTabFilesLanding &&
        filesLandingTab === "storage" &&
        !!currentDrive &&
        driveBaseName === "Storage" &&
        currentDriveMeta?.is_creator_raw !== true)
  );
  const embeddedFolderGridRevealClass = embeddedFolderBrowse ? "min-h-0" : "contents";
  const recentsRootReady = !loading && !subscriptionLoading && !powerUpContextLoading;
  const filesLandingRecentsReady =
    !filesLandingRecentsMode ||
    (!recentUploadsLoading && recentsRootReady) ||
    recentUploads.length > 0;
  /** Full-page fade unmounts the grid when false; embedded home Storage keeps the grid mounted during folder loads so prior folder content stays visible until new data arrives (no blink). After Back at Storage root, `closeDrive()` clears `currentDrive` while `drive=` is still in the URL until the URL sync effect re-opens Storage — without treating that as “embedded chrome”, `mainGridFadeReady` would follow Recents/Hearts rules (e.g. Hearts still loading) and the fade would unmount the grid until a tab click. */
  const mainGridFadeReady =
    embeddedFolderBrowse || (embeddedHomeStorage && !!searchParams.get("drive"))
      ? true
      : currentDrive
        ? !driveFilesLoading
        : threeTabFilesLanding && filesLandingTab === "storage"
          ? true
          : threeTabFilesLanding
            ? filesLandingTab === "recents"
              ? filesLandingRecentsReady
              : !(heartedLoading && heartedFiles.length === 0)
            : activeTab === "recents"
              ? recentsRootReady
              : !(heartedLoading && heartedFiles.length === 0);
  const showRecentsRootGrid = threeTabFilesLanding
    ? filesLandingTab === "recents"
    : activeTab === "recents";
  const hideFilesLandingSectionHeading =
    (embeddedHomeStorage && !!currentDrive) || filesPageStorageEmbeddedChrome;
  const filesLandingStorageFrame =
    threeTabFilesLanding &&
    filesLandingTab === "storage" &&
    hasInlineStorageDrive &&
    (!currentDrive ||
      (driveBaseName === "Storage" && currentDriveMeta?.is_creator_raw !== true));

  return (
    <div
      ref={gridSectionRef}
      className={`w-full flex flex-1 min-h-0 flex-col space-y-0${dragState?.isActive ? " select-none" : ""}${
        embeddedHomeStorage || filesPageStorageEmbeddedChrome || threeTabFilesLanding
          ? " h-full min-h-0 pl-4 pr-4 sm:pl-6 sm:pr-6 md:pr-7"
          : ""
      }`}
      data-selectable-grid
      data-embedded-home-storage={embeddedHomeStorage ? "true" : undefined}
      data-files-inline-storage={inlineStorageOnFilesPage ? "true" : undefined}
      onMouseDown={handleMouseDown}
    >
      {/* Filter section — compact; home hub keeps the canvas open (no divider under chrome). */}
      <section
        className={`shrink-0 py-4 last:border-b-0 ${
          embeddedHomeStorage
            ? "border-0 pt-1 pb-2"
            : "border-b border-neutral-200/60 dark:border-neutral-800/60"
        }`}
      >
        <div className="space-y-3">
          {quickFiltersOpen && allFilesFlatLanding && (
            <FileFiltersExpandedStrip
              filterState={filterState}
              setFilter={setFilter}
              sortValue={(filterState.sort as string) ?? "newest"}
              onSortChange={() => {}}
              onAdvancedClick={() => setFilterDrawerOpen(true)}
            />
          )}
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
        <div className="flex flex-wrap items-center gap-2 py-4 text-sm">
          <button
            type="button"
            onClick={
              isStorageV2FolderBrowse && storageParentFolderId
                ? () => {
                    void (async () => {
                      const token = await getAuthToken();
                      if (!token || !currentDrive || !storageParentFolderId) return;
                      const res = await fetch(
                        `/api/storage-folders/ancestors?folder_id=${encodeURIComponent(storageParentFolderId)}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                      if (!res.ok) return;
                      const data = (await res.json()) as {
                        ancestors?: Array<{ id: string }>;
                      };
                      /** Root→…→parent→current; parent is always second-to-last (works at any nesting depth). */
                      const list = data.ancestors ?? [];
                      const parentId =
                        list.length >= 2 ? list[list.length - 2]!.id : null;
                      const sp = new URLSearchParams(searchParams.toString());
                      sp.set("drive", currentDrive.id);
                      if (parentId) sp.set("folder", parentId);
                      else sp.delete("folder");
                      sp.delete("path");
                      const q = sp.toString();
                      router.replace(q ? `${pathname}?${q}` : pathname, {
                        scroll: false,
                      });
                      /** loadDriveFiles runs from URL `folder` sync effect only */
                      setSelectedFileIds(new Set());
                    })();
                  }
                : currentDrivePath
                  ? () => {
                      setCurrentDrivePath("");
                      setSelectedFileIds(new Set());
                    }
                  : showFilesLandingTabBar && filesLandingTab === "storage"
                    ? () => {
                        clearFlatFilesUrlAndDrive();
                        setFilesLandingTab("recents");
                      }
                    : closeDrive
            }
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-neutral-400 dark:text-neutral-500">/</span>
          {isStorageV2FolderBrowse ? (
            <StorageLocationMenu
              pathLabel={storagePathMenuLabel}
              isInsideSubfolder={!!storageParentFolderId}
              folderPinned={storageMenuFolderPinned}
              onNewFolder={() => setStoragePathCreateOpen(true)}
              onRename={storageParentFolderId ? () => setStoragePathRenameOpen(true) : undefined}
              onShare={openStoragePathShare}
              onMove={storageParentFolderId ? () => setStoragePathMoveOpen(true) : undefined}
              onTogglePin={() => void toggleStoragePathPin()}
            />
          ) : (
            <>
              <span className="flex flex-wrap items-center gap-2 font-medium text-neutral-900 dark:text-white">
                <span>{currentDrive.name}</span>
                {isStorageLegacyVirtualBrowse ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                    Classic layout
                  </span>
                ) : null}
              </span>
              {currentDrivePath ? (
                <>
                  <span className="text-neutral-400 dark:text-neutral-500">/</span>
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {isGalleryMediaDrive
                      ? formatGalleryMediaFolderBreadcrumb(currentDrivePath, galleries)
                      : currentDrivePath}
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
      )}

      {currentDrive && isStorageLegacyVirtualBrowse ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-50">
          <p className="font-medium">Update Storage layout</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            This workspace is still on the classic Storage view. Turn on the updated layout to use the same folder
            experience as the rest of the platform. We map your existing file paths into folders automatically (up to 8,000
            active files per run).
          </p>
          {storageUpgradeError ? (
            <p className="mt-2 font-medium text-red-700 dark:text-red-300">{storageUpgradeError}</p>
          ) : null}
          <button
            type="button"
            disabled={storageV2MigrateLoading}
            onClick={() => void enableStorageNestedFolders()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-800 px-3 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-60 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {storageV2MigrateLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating Storage…
              </>
            ) : (
              "Update Storage"
            )}
          </button>
        </div>
      ) : null}

      {currentDrive && isStorageV2FolderBrowse && storageFolderListError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
          {storageFolderListError}
        </div>
      ) : null}

      {/* Pinned shortcuts (root only) — hidden on All Files flat landing to keep that tab to Recents/Hearts + grid only */}
      {!currentDrive &&
        !allFilesFlatLanding &&
        (pinnedFolderItems.length > 0 || pinnedFileIds.size > 0) && (
        <section className="motion-safe:transition-opacity motion-safe:duration-500 motion-safe:ease-out border-b border-neutral-200/60 py-4 last:border-b-0 dark:border-neutral-800/60">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Pinned</h3>
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
                        onClick={() => openFolderFromPin(item)}
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
                    className={
                      [
                        "h-full min-h-0 min-w-0 w-full max-w-full",
                        canDragFolder && "cursor-grab active:cursor-grabbing",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    <FolderCard
                      item={item}
                      onClick={() => openFolderFromPin(item)}
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
        </section>
      )}

      {/* Recents / Starred / Drive content — main section */}
      <DashboardRouteFade ready={mainGridFadeReady} srOnlyMessage="Loading files">
      <section
        className={`relative py-4 last:border-b-0 dark:border-neutral-800/60 ${
          filesLandingStorageFrame
            ? "border-b-0"
            : "border-b border-neutral-200/60"
        }`}
      >
        <div
          className={
            filesLandingStorageFrame
              ? "mt-1 flex h-[min(70vh,52rem)] min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-950/30"
              : "contents"
          }
        >
          <div
            className={
              filesLandingStorageFrame
                ? "flex min-h-0 flex-1 flex-col overflow-auto px-4 py-3 sm:px-6"
                : "contents"
            }
          >
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
        {!hideFilesLandingSectionHeading ? (
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
            {currentDrive
              ? currentDrive.name
              : threeTabFilesLanding && filesLandingTab === "storage"
                ? "Storage"
                : showRecentsRootGrid
                  ? "Recents"
                  : "Hearts"}
          </h2>
        ) : null}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
          {showFilesLandingTabBar && (
            <div className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1.5 dark:border-neutral-700 dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => {
                  if (threeTabFilesLanding) {
                    setFilesLandingTab("recents");
                    clearFlatFilesUrlAndDrive();
                  } else {
                    setActiveTab("recents");
                  }
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  showRecentsRootGrid
                    ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                Recents
              </button>
              <button
                type="button"
                onClick={() => {
                  if (threeTabFilesLanding) {
                    setFilesLandingTab("hearts");
                    clearFlatFilesUrlAndDrive();
                  } else {
                    setActiveTab("hearts");
                  }
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  (threeTabFilesLanding ? filesLandingTab === "hearts" : activeTab === "hearts")
                    ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                Hearts
              </button>
              {threeTabFilesLanding ? (
                <button
                  type="button"
                  onClick={() => setFilesLandingTab("storage")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    filesLandingTab === "storage"
                      ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  Storage
                </button>
              ) : null}
            </div>
          )}
          <div className="flex items-center gap-2">
            {(useFilteredScoped
              ? filesToShow.length > 0
              : currentDrive
                ? subfolderItems.length > 0 || displayedFilesWithMacosPackages.length > 0
                : filesLandingRecentsMode
                  ? recentUploads.length > 0
                  : folderItems.length > 0 || recentFiles.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (useFilteredScoped) {
                    setSelectedFileIds(new Set(filesToShow.map((f) => f.id)));
                    setSelectedFolderKeys(new Set());
                  } else if (currentDrive) {
                    setSelectedFileIds(new Set(displayedFilesWithMacosPackages.map((f) => f.id)));
                    setSelectedFolderKeys(new Set(subfolderItems.map((s) => s.key)));
                  } else if (filesLandingRecentsMode) {
                    setSelectedFileIds(new Set(recentUploads.map((f) => f.id)));
                    setSelectedFolderKeys(new Set());
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
          <div className={embeddedFolderGridRevealClass}>
          {useFilteredScoped && filesToShow.length === 0 && !filtersLoading ? (
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
                      const rowDriveId = item.driveId ?? item.storageLinkedDriveId ?? "";
                      const isFolderInSelection = selectedFolderKeys.has(item.key);
                      const isDropTargetRow =
                        !!rowDriveId &&
                        !isFolderInSelection &&
                        linkedDrives.some((d) => d.id === rowDriveId);
                      return (
                        <FolderListRow
                          key={item.key}
                          item={item}
                          displayContext={storageDisplayContext}
                          folderRollup={virtualFolderRollupByKey.get(item.key)}
                          currentDriveName={currentDrive?.name ?? null}
                          revealFadeIn={
                            !!item.storageFolderId && storageV2RevealFolderKey === item.key
                          }
                          onStorageFolderMutated={
                            item.storageFolderId ? handleV2StorageFolderMutated : undefined
                          }
                          onClick={() => {
                            if (item.storageFolderId) {
                              navigateIntoStorageSubfolder(item);
                              return;
                            }
                            setCurrentDrivePath(item.pathPrefix ?? item.name);
                            setSelectedFileIds(new Set());
                            setSelectedFolderKeys(new Set());
                          }}
                          onDelete={
                            !item.preventDelete &&
                            (item.storageFolderId ||
                              (item.virtualFolder && !!item.pathPrefix) ||
                              !!item.driveId)
                              ? () => void handleDeleteSubfolderItem(item)
                              : undefined
                          }
                          selectable={!!item.driveId || !!item.virtualFolder}
                          selected={selectedFolderKeys.has(item.key)}
                          onSelect={() => toggleFolderSelection(item.key)}
                          isDropTarget={isDropTargetRow}
                          onItemsDropped={handleDropOnFolder}
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
                const cardDriveId = item.driveId ?? item.storageLinkedDriveId ?? "";
                const isDropTargetCard =
                  !!cardDriveId &&
                  !isFolderInSelection &&
                  linkedDrives.some((d) => d.id === cardDriveId);
                return (
                  <div
                    key={item.key}
                    data-selectable-item
                    data-item-type="folder"
                    data-item-key={item.key}
                    draggable={canDragFolder}
                    onDragStart={handleDragStart}
                    className={
                      [
                        "h-full min-h-0 min-w-0 w-full max-w-full",
                        canDragFolder && "cursor-grab active:cursor-grabbing",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    <FolderCard
                      item={item}
                      storagePickerDriveLabel={currentDrive?.name}
                      revealFadeIn={
                        !!item.storageFolderId && storageV2RevealFolderKey === item.key
                      }
                      onStorageFolderMutated={
                        item.storageFolderId ? handleV2StorageFolderMutated : undefined
                      }
                      onClick={() => {
                        if (item.storageFolderId) {
                          navigateIntoStorageSubfolder(item);
                          return;
                        }
                        setCurrentDrivePath(item.pathPrefix ?? item.name);
                        setSelectedFileIds(new Set());
                        setSelectedFolderKeys(new Set());
                      }}
                      onDelete={
                        !item.preventDelete &&
                        (item.storageFolderId ||
                          (item.virtualFolder && !!item.pathPrefix) ||
                          !!item.driveId)
                          ? () => void handleDeleteSubfolderItem(item)
                          : undefined
                      }
                      selectable
                      selected={isFolderInSelection}
                      onSelect={() => toggleFolderSelection(item.key)}
                      isDropTarget={isDropTargetCard}
                      onItemsDropped={handleDropOnFolder}
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
            <div className="flex min-h-[min(380px,52vh)] items-center justify-center px-3 py-10 sm:px-6">
              <div
                role="region"
                aria-label={isGalleryMediaDrive ? "Empty gallery media drive" : "Empty drive"}
                className="w-full max-w-xl rounded-2xl border-2 border-dashed border-neutral-200 bg-gradient-to-b from-neutral-50 to-white px-6 py-12 text-center shadow-sm dark:border-neutral-600 dark:from-neutral-900/55 dark:to-neutral-950/90 sm:px-10 sm:py-14"
              >
                <Cloud
                  className="mx-auto mb-5 h-10 w-10 text-bizzi-blue dark:text-bizzi-cyan"
                  strokeWidth={1.5}
                  aria-hidden
                />
                {isGalleryMediaDrive ? (
                  <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-base">
                    No gallery media yet. Upload photos in a gallery to see them organized by gallery
                    here.
                  </p>
                ) : (
                  <>
                    <p className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-xl">
                      This drive is empty
                    </p>
                    <p className="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-300 sm:text-lg">
                      {isStorageV2FolderBrowse ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setStoragePathCreateOpen(true)}
                            className="font-semibold text-bizzi-blue underline-offset-4 hover:underline dark:text-bizzi-cyan"
                          >
                            Create folder
                          </button>
                          <span className="text-neutral-400 dark:text-neutral-500" aria-hidden>
                            {" "}
                            ·{" "}
                          </span>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void openUploadFromEmptyState()}
                        className="font-semibold text-bizzi-blue underline-offset-4 hover:underline dark:text-bizzi-cyan"
                      >
                        Select files
                      </button>
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {" "}
                        — or drag and drop to upload.
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
          </div>
        ) : showRecentsRootGrid ? (
          <>
            {showFolders &&
              folderItems.length > 0 &&
              !(threeTabFilesLanding && filesLandingTab === "recents") && (
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
                        className={
                          [
                            "h-full min-h-0 min-w-0 w-full max-w-full",
                            canDragFolder && "cursor-grab active:cursor-grabbing",
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
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
            {rootRecentsFilesForGrid.length > 0 && (
              <>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {useFilteredScoped ? "Files" : filesLandingRecentsMode ? "Recent uploads" : "Recently synced files"}
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
                        {rootRecentsFilesForGrid.map((file) => (
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
                  {filesLandingRecentsMode && recentUploadsLoading && recentUploads.length === 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 text-sm text-neutral-500 dark:bg-neutral-900/80 dark:text-neutral-400" aria-busy="true">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent dark:border-bizzi-cyan dark:border-t-transparent" />
                        Loading recent uploads…
                      </span>
                    </div>
                  )}
                  {rootRecentsFilesForGrid.map((file) => {
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
              !filesLandingRecentsMode &&
              filesToShow.length === 0 && (
                <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  {hasFilters
                    ? "No files match your filters. Try adjusting or clearing filters."
                    : "No files yet. Use New → File Upload, or refresh after uploading."}
                </div>
              )}
            {filesLandingRecentsMode &&
              !recentUploadsLoading &&
              recentUploads.length === 0 && (
                <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
                  Files uploaded to Storage in the past 7 days will appear here. (Upload time counts, not
                  camera file dates.)
                </p>
              )}
            {!loading &&
              !useFilteredScoped &&
              !filesLandingRecentsMode &&
              folderItems.length === 0 &&
              filesToShow.length === 0 && (
                <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No files yet. Use New → File Upload to add files to this drive.
                </div>
              )}
          </>
        ) : heartedFiles.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {workspaceHeartsActive
              ? "No hearted files from your workspace yet. Hearts from any seat member appear here when you have access to the file."
              : "Files you heart will appear here for quick access."}
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
          </div>
        </div>
      </section>
      </DashboardRouteFade>
      </FilesViewWrapper>
        </div>

        {moveErrorNotice ? (
          <div
            role="alert"
            className="fixed bottom-[max(12rem,calc(env(safe-area-inset-bottom,0px)+10rem))] left-1/2 z-[45] flex max-w-[min(92vw,24rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-950 shadow-lg dark:border-red-900/50 dark:bg-red-950/90 dark:text-red-100"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-300" aria-hidden />
            <span className="text-left">{moveErrorNotice}</span>
          </div>
        ) : null}
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
        folders={linkedDrivesForBulkMove}
        onMove={handleBulkMoveConfirm}
        v2IntraDrive={
          bulkV2IntraEligible && currentDrive
            ? {
                linkedDriveId: currentDrive.id,
                driveLabel: (() => {
                  const m = linkedDrives.find((d) => d.id === currentDrive.id);
                  return m ? teamAwareDriveName(m.name) : currentDrive.name;
                })(),
                currentParentFolderId: (() => {
                  const parents = new Set<string | null>();
                  for (const id of selectedFileIds) {
                    const row = displayedFilesWithMacosPackages.find((f) => f.id === id);
                    parents.add(row?.folder_id ?? null);
                  }
                  if (parents.size !== 1) return undefined;
                  return parents.values().next().value ?? null;
                })(),
                onMoveToFolder: async (targetFolderId) => {
                  try {
                    setMoveErrorNotice(null);
                    await moveFilesToStorageFolder(Array.from(selectedFileIds), targetFolderId);
                    clearSelection();
                    await refetch();
                    if (currentDrive) await loadDriveFiles(currentDrive.id);
                    const dest =
                      targetFolderId === null ? "Storage root" : "folder in Storage";
                    setMoveNotice(`Files moved to ${dest}`);
                  } catch (e) {
                    setMoveNotice(null);
                    setMoveErrorNotice(e instanceof Error ? e.message : "Move failed");
                    throw e;
                  }
                },
              }
            : undefined
        }
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

      {currentDrive && isStorageV2FolderBrowse && user ? (
        <CreateFolderModal
          open={storagePathCreateOpen}
          onClose={() => setStoragePathCreateOpen(false)}
          title="New folder"
          defaultName="Untitled folder"
          onCreateEmpty={async (folderName) => {
            const token = await user.getIdToken();
            const res = await fetch("/api/storage-folders", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                linked_drive_id: currentDrive.id,
                parent_folder_id: storageParentFolderId,
                name: folderName.trim(),
              }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error((data.error as string) ?? "Could not create folder");
            }
            const created = (await res.json()) as { id?: string };
            const newId = typeof created.id === "string" ? created.id : "";
            if (newId && currentDrive) {
              const nk = buildStorageV2FolderPinId(currentDrive.id, newId);
              setStorageV2RevealFolderKey(nk);
              window.setTimeout(() => {
                setStorageV2RevealFolderKey((k) => (k === nk ? null : k));
              }, 920);
            }
            bumpStorageVersion();
            setStoragePathCreateOpen(false);
            handleV2StorageFolderMutated();
          }}
        />
      ) : null}

      {currentDrive &&
      isStorageV2FolderBrowse &&
      storageParentFolderId &&
      storageContextFolderVersion != null ? (
        <>
          <RenameModal
            open={storagePathRenameOpen}
            onClose={() => setStoragePathRenameOpen(false)}
            currentName={storageRenameCurrentName}
            onRename={async (newName) => {
              await renameStorageFolder(
                storageParentFolderId,
                newName,
                storageContextFolderVersion
              );
              setStoragePathRenameOpen(false);
              handleV2StorageFolderMutated();
            }}
            itemType="folder"
          />
          <StorageFolderTreePickerModal
            open={storagePathMoveOpen}
            onClose={() => setStoragePathMoveOpen(false)}
            linkedDriveId={currentDrive.id}
            driveLabel={currentDrive.name}
            title={`Move “${storageRenameCurrentName}” into…`}
            excludedFolderIds={[storageParentFolderId]}
            onConfirm={async (targetParentFolderId) => {
              await moveStorageFolder(
                storageParentFolderId,
                targetParentFolderId,
                storageContextFolderVersion
              );
              setStoragePathMoveOpen(false);
              setStorageParentFolderId(targetParentFolderId);
              const sp = new URLSearchParams(searchParams.toString());
              sp.set("drive", currentDrive.id);
              if (targetParentFolderId) sp.set("folder", targetParentFolderId);
              else sp.delete("folder");
              sp.delete("path");
              const q = sp.toString();
              router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
              handleV2StorageFolderMutated();
            }}
          />
        </>
      ) : null}

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
        showLUTForVideo={filePreviewRawLut.showLUTForVideo}
        lutConfig={filePreviewRawLut.lutConfig}
        lutLibrary={filePreviewRawLut.lutLibrary}
      />
    </div>
  );
}
