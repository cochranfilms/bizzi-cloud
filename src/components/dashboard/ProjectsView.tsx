"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getUserIdToken } from "@/lib/auth-token";
import { apiFileToRecentFile, type RecentFile, useCloudFiles } from "@/hooks/useCloudFiles";
import { usePathname } from "next/navigation";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FilePreviewModal from "./FilePreviewModal";
import { useLayoutSettings, type ViewMode, type CardSize, type AspectRatio } from "@/context/LayoutSettingsContext";
import { getCardAspectClass } from "@/lib/card-aspect-utils";
import {
  expandMacosPackageRowIds,
  mergeDriveFilesWithMacosPackages,
  type MacosPackageListEntry,
} from "@/lib/macos-package-display";
import { Check, Download, FolderInput, Loader2, Send, Share2, Trash2 } from "lucide-react";
import SectionTitle from "./SectionTitle";
import BulkMoveModal from "./BulkMoveModal";
import CreateTransferModal, { type TransferModalFile } from "./CreateTransferModal";
import ShareModal from "./ShareModal";
import { filterLinkedDrivesByPowerUp } from "@/lib/drive-powerup-filter";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { useConfirm } from "@/hooks/useConfirm";
import { getMovePayloadFromDragSource, setDragMovePayload } from "@/lib/dnd-move-items";
import { useBulkDownload } from "@/hooks/useBulkDownload";
import type { LinkedDrive } from "@/types/backup";
import { fetchPackagesListCached } from "@/lib/packages-list-cache";

const MAX_PAGES = 15;

function ProjectsFilesSkeleton({
  viewMode,
  cardSize,
  aspectRatio,
}: {
  viewMode: ViewMode;
  cardSize: CardSize;
  aspectRatio: AspectRatio;
}) {
  const pulse = "animate-pulse rounded-lg bg-neutral-200/80 dark:bg-neutral-800/90";
  if (viewMode === "list") {
    return (
      <div
        className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700"
        aria-busy="true"
        aria-label="Loading project files"
      >
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className={`h-4 w-4 shrink-0 rounded ${pulse}`} />
              <div className={`h-4 min-w-0 flex-1 ${pulse}`} />
              <div className={`hidden h-4 w-24 shrink-0 sm:block ${pulse}`} />
              <div className={`hidden h-4 w-16 shrink-0 md:block ${pulse}`} />
              <div className={`hidden h-4 w-28 shrink-0 lg:block ${pulse}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const gridCols =
    viewMode === "thumbnail"
      ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      : cardSize === "small"
        ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        : cardSize === "large"
          ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
          : "sm:grid-cols-3 md:grid-cols-4";
  const thumbCount = viewMode === "thumbnail" ? 8 : 10;
  return (
    <div className={`grid ${viewMode === "thumbnail" ? "gap-3" : "gap-4"} ${gridCols}`} aria-busy="true" aria-label="Loading project files">
      {Array.from({ length: thumbCount }).map((_, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-2">
          <div className={`w-full rounded-xl ${pulse} ${getCardAspectClass(aspectRatio)}`} />
          <div className={`h-3 w-[85%] ${pulse}`} />
          <div className={`h-3 w-[55%] ${pulse}`} />
        </div>
      ))}
    </div>
  );
}

const NO_FOLDER_SELECTION: Set<string> = new Set();

type ProjectsContext = "personal" | "enterprise" | "team";

function teamOwnerFromPath(pathname: string | null): string | null {
  const m = pathname ? /^\/team\/([^/]+)/.exec(pathname) : null;
  return m?.[1]?.trim() || null;
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
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;
  const canShare = total >= 1;
  const showDownload = selectedFileCount >= 1;
  const downloadDisabled = selectedFileCount > 50 || isDownloading;
  const downloadTitle = selectedFileCount > 50 ? "Download supports up to 50 files at once" : undefined;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label} selected</span>
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
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
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

export default function ProjectsView({
  basePath: _basePath = "/dashboard",
}: {
  basePath?: string;
}) {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const { linkedDrives, storageVersion } = useBackup();
  const pathname = usePathname();
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();
  const { confirm } = useConfirm();
  const {
    refetch,
    deleteFiles,
    fetchFilesByIds,
    getFileIdsForBulkShare,
    moveFilesToFolder,
  } = useCloudFiles();
  const { download: bulkDownload, isLoading: bulkDownloadLoading } = useBulkDownload({ fetchFilesByIds });

  const {
    viewMode,
    cardSize,
    aspectRatio,
    thumbnailScale,
    showCardInfo,
  } = useLayoutSettings();
  const gridGapClass = viewMode === "thumbnail" ? "gap-3" : "gap-4";

  const ctx: ProjectsContext = pathname?.startsWith("/enterprise")
    ? "enterprise"
    : teamOwnerFromPath(pathname ?? null)
      ? "team"
      : "personal";
  const teamOwnerUserId = teamOwnerFromPath(pathname ?? null);
  const storageDisplayContext = useMemo(() => {
    if (typeof pathname === "string" && pathname.startsWith("/enterprise")) {
      return { locationScope: "enterprise" as const };
    }
    if (typeof pathname === "string" && /^\/team\//.test(pathname)) {
      return { locationScope: "team" as const };
    }
    return { locationScope: "personal" as const };
  }, [pathname]);

  const [rows, setRows] = useState<RecentFile[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [memberFilesForMove, setMemberFilesForMove] = useState<RecentFile[]>([]);
  const [allPackagesForMove, setAllPackagesForMove] = useState<MacosPackageListEntry[]>([]);
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferInitialFiles, setTransferInitialFiles] = useState<TransferModalFile[]>([]);
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
  const [moveNotice, setMoveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!moveNotice) return;
    const t = window.setTimeout(() => setMoveNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [moveNotice]);

  const scopedDrives = useMemo((): LinkedDrive[] => {
    return linkedDrives.filter((d) => {
      if (ctx === "enterprise" && org?.id) return d.organization_id === org.id;
      if (ctx === "team" && teamOwnerUserId) {
        return d.user_id === teamOwnerUserId && !d.organization_id;
      }
      return !d.organization_id;
    });
  }, [linkedDrives, ctx, org?.id, teamOwnerUserId]);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setMemberFilesForMove([]);
      setAllPackagesForMove([]);
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);
    try {
      const token = await getUserIdToken(user, false);
      if (!token) {
        setRows([]);
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const driveNameById = new Map(linkedDrives.map((d) => [d.id, d.name ?? "Folder"]));
      const paramsBase = new URLSearchParams({
        sort: "newest",
        page_size: "100",
        creative_projects: "true",
      });
      if (ctx === "enterprise" && org?.id) {
        paramsBase.set("context", "enterprise");
        paramsBase.set("organization_id", org.id);
      } else if (ctx === "team" && teamOwnerUserId) {
        paramsBase.set("team_owner_id", teamOwnerUserId);
      }

      const fetchAllCreativePages = async (): Promise<RecentFile[]> => {
        const collected: RecentFile[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < MAX_PAGES; page++) {
          const params = new URLSearchParams(paramsBase);
          if (cursor) params.set("cursor", cursor);
          const res = await fetch(`${origin}/api/files/filter?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) break;
          const data = (await res.json()) as {
            files?: Record<string, unknown>[];
            cursor?: string | null;
            hasMore?: boolean;
          };
          for (const raw of data.files ?? []) {
            collected.push(apiFileToRecentFile(raw, driveNameById));
          }
          if (!data.hasMore || !data.cursor) break;
          cursor = data.cursor;
        }
        return collected;
      };

      const fetchPackagesForAllDrives = () =>
        Promise.all(
          scopedDrives.map(async (drive): Promise<{ driveId: string; packages: MacosPackageListEntry[] }> => {
            try {
              const packages = await fetchPackagesListCached({
                origin,
                token,
                driveId: drive.id,
                folderPath: "",
                storageVersion,
              });
              return { driveId: drive.id, packages };
            } catch {
              return { driveId: drive.id, packages: [] as MacosPackageListEntry[] };
            }
          })
        );

      const [collected, packageResults] = await Promise.all([
        fetchAllCreativePages(),
        fetchPackagesForAllDrives(),
      ]);

      const allPkgs = packageResults.flatMap((r) => r.packages);
      setAllPackagesForMove(allPkgs);

      const byDrive = new Map<string, RecentFile[]>();
      for (const f of collected) {
        const arr = byDrive.get(f.driveId) ?? [];
        arr.push(f);
        byDrive.set(f.driveId, arr);
      }
      const merged: RecentFile[] = [];
      for (const drive of scopedDrives) {
        const packages = packageResults.find((p) => p.driveId === drive.id)?.packages ?? [];
        const driveFiles = byDrive.get(drive.id) ?? [];
        merged.push(
          ...(mergeDriveFilesWithMacosPackages(
            driveFiles,
            packages,
            drive.id,
            drive.name ?? "Folder"
          ) as RecentFile[])
        );
      }
      merged.sort((a, b) => {
        const ta = new Date(a.uploadedAt ?? a.modifiedAt ?? 0).getTime();
        const tb = new Date(b.uploadedAt ?? b.modifiedAt ?? 0).getTime();
        return tb - ta;
      });
      setRows(merged);
      setMemberFilesForMove(collected);
    } finally {
      setProjectsLoading(false);
    }
  }, [user, ctx, org?.id, teamOwnerUserId, linkedDrives, scopedDrives, storageVersion]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearSelection = useCallback(() => {
    setSelectedFileIds(new Set());
  }, []);

  const toggleFileSelection = useCallback((id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const payload = getMovePayloadFromDragSource(
        e.currentTarget as HTMLElement,
        selectedFileIds,
        NO_FOLDER_SELECTION
      );
      if (!payload || payload.fileIds.length + payload.folderKeys.length === 0) {
        e.preventDefault();
        return;
      }
      setDragMovePayload(e.dataTransfer, payload);
      e.dataTransfer.effectAllowed = "move";
    },
    [selectedFileIds]
  );

  const performMove = useCallback(
    async (fileIds: string[], targetDriveId: string) => {
      const expandedIds = expandMacosPackageRowIds(fileIds, memberFilesForMove, allPackagesForMove);
      if (expandedIds.length > 0) {
        await moveFilesToFolder(expandedIds, targetDriveId);
      }
      clearSelection();
      await refetch();
      await load();
      const destName = linkedDrives.find((d) => d.id === targetDriveId)?.name ?? "folder";
      setMoveNotice(`Items moved into the "${destName}" folder`);
    },
    [memberFilesForMove, allPackagesForMove, moveFilesToFolder, linkedDrives, clearSelection, refetch, load]
  );

  const handleBulkMoveConfirm = useCallback(
    async (targetDriveId: string) => {
      await performMove(Array.from(selectedFileIds), targetDriveId);
      setMoveModalOpen(false);
    },
    [selectedFileIds, performMove]
  );

  const handleBulkDelete = useCallback(async () => {
    const fileIds = expandMacosPackageRowIds(
      Array.from(selectedFileIds),
      memberFilesForMove,
      allPackagesForMove
    );
    if (fileIds.length === 0) return;
    const ok = await confirm({
      message: `Delete ${fileIds.length} item${fileIds.length === 1 ? "" : "s"}? You can restore files from Deleted files.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFiles(fileIds);
      clearSelection();
      await refetch();
      await load();
    } catch (e) {
      console.error(e);
    }
  }, [selectedFileIds, memberFilesForMove, allPackagesForMove, confirm, deleteFiles, clearSelection, refetch, load]);

  const handleBulkShare = useCallback(async () => {
    const fileIds = expandMacosPackageRowIds(
      Array.from(selectedFileIds),
      memberFilesForMove,
      allPackagesForMove
    );
    try {
      const allFileIds = await getFileIdsForBulkShare(fileIds, []);
      if (allFileIds.length === 0) return;
      setShareFolderName(`Share ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`);
      setShareReferencedFileIds(allFileIds);
      setShareDriveId(null);
      setShareInitialData(null);
      setShareModalOpen(true);
      clearSelection();
      await refetch();
      await load();
    } catch (e) {
      console.error(e);
    }
  }, [selectedFileIds, memberFilesForMove, allPackagesForMove, getFileIdsForBulkShare, clearSelection, refetch, load]);

  const handleBulkNewTransfer = useCallback(async () => {
    const fileIds = expandMacosPackageRowIds(
      Array.from(selectedFileIds),
      memberFilesForMove,
      allPackagesForMove
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
  }, [selectedFileIds, memberFilesForMove, allPackagesForMove, fetchFilesByIds]);

  const handleBulkDownload = useCallback(() => {
    bulkDownload(
      expandMacosPackageRowIds(Array.from(selectedFileIds), memberFilesForMove, allPackagesForMove)
    );
  }, [bulkDownload, selectedFileIds, memberFilesForMove, allPackagesForMove]);

  const movementFolders = filterLinkedDrivesByPowerUp(linkedDrives, { hasEditor, hasGallerySuite });

  return (
    <div className="w-full space-y-0">
      <SectionTitle className="mb-4 mt-1">Creative projects</SectionTitle>
      {projectsLoading ? (
        <ProjectsFilesSkeleton
          viewMode={viewMode}
          cardSize={cardSize}
          aspectRatio={aspectRatio}
        />
      ) : rows.length === 0 ? (
        <p className="text-neutral-500 dark:text-neutral-400">
          No creative project files yet. Upload a Premiere (.prproj), Final Cut library, Resolve export
          (.drp), or other project files to Storage — they will appear here for this workspace.
        </p>
      ) : viewMode === "list" ? (
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
                <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white" />
              </tr>
            </thead>
            <tbody data-selectable-grid>
              {rows.map((file) => (
                <FileListRow
                  key={file.id}
                  file={file}
                  columnMode="projects"
                  displayContext={storageDisplayContext}
                  onClick={() => setPreviewFile(file)}
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
          className={`grid ${gridGapClass} ${
            viewMode === "thumbnail"
              ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
              : cardSize === "small"
                ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                : cardSize === "large"
                  ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
                  : "sm:grid-cols-3 md:grid-cols-4"
          }`}
        >
          {rows.map((file) => (
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

      {moveNotice ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[45] flex max-w-[min(92vw,24rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-lg dark:border-emerald-800/60 dark:bg-emerald-950/90 dark:text-emerald-100"
        >
          <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
          <span className="text-left">{moveNotice}</span>
        </div>
      ) : null}

      {selectedFileIds.size > 0 && (
        <BulkActionBar
          selectedFileCount={selectedFileIds.size}
          selectedFolderCount={0}
          onMove={() => setMoveModalOpen(true)}
          onNewTransfer={handleBulkNewTransfer}
          onShare={handleBulkShare}
          onDownload={handleBulkDownload}
          isDownloading={bulkDownloadLoading}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}

      <BulkMoveModal
        open={moveModalOpen}
        onClose={() => setMoveModalOpen(false)}
        selectedFileCount={selectedFileIds.size}
        selectedFolderCount={0}
        excludeDriveIds={[]}
        folders={movementFolders}
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

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
