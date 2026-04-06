"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import {
  ChevronLeft,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Film,
  Loader2,
  Play,
  Plus,
} from "lucide-react";
import { getUserIdToken } from "@/lib/auth-token";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import type { LinkedDrive } from "@/types/backup";
import type { RecentFile } from "@/hooks/useCloudFiles";
import {
  filterScopedLinkedDrives,
  fetchStorageFolderList,
  apiFileToRecentFile,
  type StorageFolderListFolder,
} from "@/hooks/useCloudFiles";
import { isGalleryVideo, isGalleryImage } from "@/lib/gallery-file-types";
import { teamAwareBaseDriveName } from "@/lib/storage-folder-model-policy";
import { usePathname } from "next/navigation";
import { useInView } from "@/hooks/useInView";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";

function teamAwareLabel(name: string): string {
  return name.replace(/^\[Team\]\s+/, "");
}

/** Storage pillar vs RAW Creator pillar vs everything else (custom drives). */
function pickerDriveKind(d: LinkedDrive): "storage" | "raw" | "custom" {
  const base = teamAwareBaseDriveName(d.name);
  if (base === "Storage" || base === "Uploads") return "storage";
  if (d.is_creator_raw === true || base === "RAW") return "raw";
  return "custom";
}

/**
 * Multiple `linked_drives` can map to the same pillar label (e.g. two RAW). Keep one canonical
 * tile each for Storage and RAW (oldest by `created_at`), then list custom drives.
 */
function dedupePickerPillarDrives(drives: LinkedDrive[]): LinkedDrive[] {
  const createdMs = (x: LinkedDrive) =>
    x.created_at ? Date.parse(x.created_at) : Number.MAX_SAFE_INTEGER;
  const pillarBest = new Map<"storage" | "raw", LinkedDrive>();
  const customs: LinkedDrive[] = [];
  for (const d of drives) {
    const kind = pickerDriveKind(d);
    if (kind === "custom") {
      customs.push(d);
      continue;
    }
    const cur = pillarBest.get(kind);
    if (!cur) {
      pillarBest.set(kind, d);
      continue;
    }
    const mc = createdMs(cur);
    const md = createdMs(d);
    if (md < mc || (md === mc && d.id < cur.id)) {
      pillarBest.set(kind, d);
    }
  }
  const pillars = Array.from(pillarBest.values()).sort((a, b) => {
    const oa = pickerDriveKind(a) === "storage" ? 0 : 1;
    const ob = pickerDriveKind(b) === "storage" ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
  customs.sort((a, b) => teamAwareLabel(a.name).localeCompare(teamAwareLabel(b.name)));
  return [...pillars, ...customs];
}

function rectsIntersect(a: DOMRectReadOnly, b: DOMRectReadOnly): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function normalizeClientRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

async function fetchDriveFilesFallback(
  user: User,
  driveId: string,
  driveName: string,
  opts: {
    teamOwnerUserId: string | null;
    orgId: string | null;
    isEnterpriseContext: boolean;
  }
): Promise<RecentFile[]> {
  const token = await getUserIdToken(user, false);
  if (!token) return [];
  const params = new URLSearchParams({
    sort: "newest",
    page_size: "120",
    drive_id: driveId,
  });
  if (opts.teamOwnerUserId) params.set("team_owner_id", opts.teamOwnerUserId);
  if (opts.isEnterpriseContext && opts.orgId) {
    params.set("context", "enterprise");
    params.set("organization_id", opts.orgId);
  }
  const res = await fetch(`/api/files/filter?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: Record<string, unknown>[] };
  const nameMap = new Map<string, string>([[driveId, driveName]]);
  return (data.files ?? []).map((raw) => apiFileToRecentFile(raw, nameMap));
}

function PickFileTile({
  file,
  selected,
  onToggle,
  onPickToggle,
}: {
  file: RecentFile;
  selected: boolean;
  onToggle: () => void;
  onPickToggle: (addToSelection: boolean) => void;
}) {
  const [btnRef, isInView] = useInView<HTMLButtonElement>();
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb", {
    enabled: isInView,
    contentType: file.contentType,
  });
  const isVideo =
    /\.(mp4|webm|mov|m4v)$/i.test(file.name) || (file.contentType?.startsWith("video/") ?? false);
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !!file.objectKey && isVideo && isInView,
    isVideo,
  });

  return (
    <button
      ref={btnRef}
      type="button"
      data-gallery-pick-tile="file"
      data-file-id={file.id}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          onToggle();
          return;
        }
        if (e.shiftKey) {
          onPickToggle(true);
          return;
        }
        onToggle();
      }}
      className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border-2 p-1 transition-colors ${
        selected
          ? "border-bizzi-blue bg-bizzi-blue/10"
          : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
      }`}
    >
      {(thumbnailUrl || videoThumbnailUrl) ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={videoThumbnailUrl ?? thumbnailUrl ?? ""}
            alt=""
            className="h-full w-full object-cover"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 shadow-lg">
                <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {isVideo ? (
            <Film className="h-6 w-6 text-neutral-500" />
          ) : (
            <ImageIcon className="h-6 w-6 text-neutral-500" />
          )}
        </div>
      )}
      <span className="mt-1 w-full truncate text-center text-xs">{file.name}</span>
    </button>
  );
}

type BrowseLocation = {
  driveId: string;
  driveName: string;
  parentFolderId: string | null;
  /** Labels for breadcrumb (drive + folders), matches path */
  trail: { id: string | null; name: string }[];
};

type TabKey = "browse" | "recent";

export interface GalleryAddFromLibraryModalProps {
  open: boolean;
  onClose: () => void;
  isVideoGallery: boolean;
  /** When true, show the RAW linked drive in the picker (RAW video galleries only). */
  showRawDrive: boolean;
  isTeamRoute: boolean;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  recentEligibleFiles: RecentFile[];
  onAdd: () => void | Promise<void>;
  adding: boolean;
}

export default function GalleryAddFromLibraryModal({
  open,
  onClose,
  isVideoGallery,
  showRawDrive,
  isTeamRoute,
  selectedIds,
  setSelectedIds,
  recentEligibleFiles,
  onAdd,
  adding,
}: GalleryAddFromLibraryModalProps) {
  const { user } = useAuth();
  const { linkedDrives } = useBackup();
  const { org } = useEnterprise();
  const pathname = usePathname() ?? "";
  const isEnterpriseContext = pathname.startsWith("/enterprise") || pathname.startsWith("/desktop");
  const teamRouteOwnerUid = /^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() || null;
  const orgId = org?.id ?? null;

  const [tab, setTab] = useState<TabKey>("browse");
  const [browseLocation, setBrowseLocation] = useState<BrowseLocation | null>(null);
  const [folders, setFolders] = useState<StorageFolderListFolder[]>([]);
  const [folderFiles, setFolderFiles] = useState<RecentFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [legacyFlatDrive, setLegacyFlatDrive] = useState(false);

  const eligibleFilter = useCallback(
    (f: RecentFile) => {
      if (f.driveName === "Gallery Media" || teamAwareLabel(f.driveName) === "Gallery Media")
        return false;
      if (isVideoGallery) {
        if (!isGalleryVideo(f.name)) return false;
        if (f.contentType?.startsWith("image/")) return false;
        return true;
      }
      if (!isGalleryImage(f.name)) return false;
      if (f.contentType?.startsWith("video/")) return false;
      return true;
    },
    [isVideoGallery]
  );

  const pickerDrives = useMemo(() => {
    let rows = filterScopedLinkedDrives(linkedDrives, {
      isEnterpriseContext,
      orgId,
      creatorOnly: false,
      teamRouteOwnerUid,
    }).filter(
      (d) =>
        teamAwareLabel(d.name) !== "Gallery Media" && d.name !== "Gallery Media"
    );
    if (!showRawDrive) {
      rows = rows.filter((d) => pickerDriveKind(d) !== "raw");
    }
    return dedupePickerPillarDrives(rows);
  }, [
    linkedDrives,
    isEnterpriseContext,
    orgId,
    teamRouteOwnerUid,
    showRawDrive,
  ]);

  const visibleFileIdsForBulkSelect = useMemo(() => {
    if (tab === "recent") return recentEligibleFiles.slice(0, 200).map((f) => f.id);
    return folderFiles.map((f) => f.id);
  }, [tab, recentEligibleFiles, folderFiles]);

  const loadBrowseLevel = useCallback(
    async (loc: BrowseLocation) => {
      if (!user) return;
      setListLoading(true);
      setListNotice(null);
      setLegacyFlatDrive(false);
      try {
        const listed = await fetchStorageFolderList(
          loc.driveId,
          loc.parentFolderId,
          loc.driveName
        );
        if (listed.listError) {
          setListNotice(
            "Folder browsing isn’t available for this drive (classic layout). Showing recent files from this drive instead."
          );
          setLegacyFlatDrive(true);
          const flat = await fetchDriveFilesFallback(user, loc.driveId, loc.driveName, {
            teamOwnerUserId: teamRouteOwnerUid,
            orgId,
            isEnterpriseContext,
          });
          setFolders([]);
          setFolderFiles(flat.filter(eligibleFilter));
          return;
        }
        setFolders(listed.folders);
        setFolderFiles(listed.files.filter(eligibleFilter));
      } catch {
        setFolders([]);
        setFolderFiles([]);
        setListNotice("Could not load this location.");
      } finally {
        setListLoading(false);
      }
    },
    [user, eligibleFilter, teamRouteOwnerUid, orgId, isEnterpriseContext]
  );

  useEffect(() => {
    if (!open) {
      setBrowseLocation(null);
      setTab("browse");
      setFolders([]);
      setFolderFiles([]);
      setListNotice(null);
      setLegacyFlatDrive(false);
      dragRef.current = null;
      setRubber(null);
      return;
    }
    if (browseLocation) {
      void loadBrowseLevel(browseLocation);
    }
  }, [open, browseLocation, loadBrowseLevel]);

  useEffect(() => {
    dragRef.current = null;
    setRubber(null);
  }, [tab]);

  const openDrive = (d: LinkedDrive) => {
    const label = teamAwareLabel(d.name);
    setBrowseLocation({
      driveId: d.id,
      driveName: d.name,
      parentFolderId: null,
      trail: [{ id: null, name: label }],
    });
  };

  const enterFolder = (f: StorageFolderListFolder) => {
    if (!browseLocation || legacyFlatDrive) return;
    setBrowseLocation({
      ...browseLocation,
      parentFolderId: f.id,
      trail: [...browseLocation.trail, { id: f.id, name: f.name }],
    });
  };

  const goCrumb = (index: number) => {
    if (!browseLocation) return;
    const nextTrail = browseLocation.trail.slice(0, index + 1);
    const last = nextTrail[nextTrail.length - 1];
    setBrowseLocation({
      driveId: browseLocation.driveId,
      driveName: browseLocation.driveName,
      parentFolderId: last?.id ?? null,
      trail: nextTrail,
    });
  };

  const goUp = () => {
    if (!browseLocation || browseLocation.trail.length <= 1) {
      setBrowseLocation(null);
      return;
    }
    goCrumb(browseLocation.trail.length - 2);
  };

  const toggleSelect = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const addManyToSelection = (ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const [rubber, setRubber] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.curX = e.clientX;
      d.curY = e.clientY;
      const grid = gridRef.current;
      const r = grid?.getBoundingClientRect();
      if (!r || !grid) return;
      const n = normalizeClientRect(d.startX, d.startY, d.curX, d.curY);
      setRubber({
        left: n.left - r.left + grid.scrollLeft,
        top: n.top - r.top + grid.scrollTop,
        width: n.right - n.left,
        height: n.bottom - n.top,
      });
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setRubber(null);
      if (!d || !gridRef.current) return;
      const n = normalizeClientRect(d.startX, d.startY, e.clientX, e.clientY);
      if (Math.abs(n.right - n.left) < 4 && Math.abs(n.bottom - n.top) < 4) return;

      const selRect = {
        left: n.left,
        top: n.top,
        right: n.right,
        bottom: n.bottom,
        width: n.right - n.left,
        height: n.bottom - n.top,
        toJSON() {
          return this;
        },
      } as DOMRectReadOnly;

      const nodes = gridRef.current.querySelectorAll("[data-gallery-pick-tile=file]");
      const hit: string[] = [];
      nodes.forEach((node) => {
        const id = (node as HTMLElement).dataset.fileId;
        if (!id) return;
        const br = node.getBoundingClientRect();
        if (rectsIntersect(selRect, br)) hit.push(id);
      });
      if (hit.length === 0) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of hit) next.add(id);
        return next;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [open, setSelectedIds]);

  const startMarquee = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-gallery-pick-tile]")) return;
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY };
    const n = normalizeClientRect(e.clientX, e.clientY, e.clientX, e.clientY);
    setRubber({
      left: n.left - r.left + (gridRef.current?.scrollLeft ?? 0),
      top: n.top - r.top + (gridRef.current?.scrollTop ?? 0),
      width: 0,
      height: 0,
    });
  };

  const selectAllInView = () => {
    addManyToSelection(visibleFileIdsForBulkSelect);
  };

  const deselectAllInView = () => {
    if (visibleFileIdsForBulkSelect.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleFileIdsForBulkSelect) next.delete(id);
      return next;
    });
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {isVideoGallery ? "Add videos" : "Add photos"}
          </h2>
          <button
            type="button"
            onClick={() => {
              onClose();
            }}
            className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
          >
            ×
          </button>
        </div>

        <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("browse")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "browse"
                  ? "bg-bizzi-blue/15 text-bizzi-blue"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              Browse folders
            </button>
            <button
              type="button"
              onClick={() => setTab("recent")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "recent"
                  ? "bg-bizzi-blue/15 text-bizzi-blue"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              Recent uploads
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
            {isVideoGallery
              ? showRawDrive
                ? isTeamRoute
                  ? "Browse your team Storage and RAW folders, or pick from recent videos. Gallery Media is excluded."
                  : "Browse your Storage and RAW folders, or pick from recent videos. Gallery Media is excluded."
                : isTeamRoute
                  ? "Browse your team Storage folder, or pick from recent videos. Gallery Media is excluded. RAW is only shown for RAW video galleries."
                  : "Browse your Storage folder, or pick from recent videos. Gallery Media is excluded. RAW is only shown for RAW video galleries."
              : isTeamRoute
                ? "Browse your team folders to match how files are organized, or use Recent uploads. Gallery Media is excluded — photos only."
                : "Browse your folders to match how files are organized, or use Recent uploads. Gallery Media is excluded — photos only."}
          </p>

          {tab === "browse" && (
            <>
              {listNotice && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  {listNotice}
                </div>
              )}

              {!browseLocation ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {pickerDrives.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openDrive(d)}
                      className="flex items-center gap-3 rounded-xl border border-neutral-200 p-4 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                      <HardDrive className="h-8 w-8 shrink-0 text-neutral-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-white">
                          {teamAwareLabel(d.name)}
                        </p>
                        <p className="text-xs text-neutral-500">Open folder</p>
                      </div>
                    </button>
                  ))}
                  {pickerDrives.length === 0 && (
                    <p className="col-span-full py-8 text-center text-sm text-neutral-500">
                      No drives available to browse in this workspace.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setBrowseLocation(null)}
                      className="rounded-lg border border-neutral-200 px-2 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                      All drives
                    </button>
                    {browseLocation.trail.map((crumb, i) => (
                      <span key={`${crumb.id ?? "root"}-${i}`} className="flex items-center gap-1">
                        <span className="text-neutral-400">/</span>
                        <button
                          type="button"
                          onClick={() => goCrumb(i)}
                          className="max-w-[10rem] truncate text-bizzi-blue hover:underline"
                        >
                          {crumb.name}
                        </button>
                      </span>
                    ))}
                    {!legacyFlatDrive && browseLocation.trail.length > 1 && (
                      <button
                        type="button"
                        onClick={goUp}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Up
                      </button>
                    )}
                  </div>

                  {!listLoading && (
                    <div className="mb-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                      <button
                        type="button"
                        onClick={selectAllInView}
                        className="text-xs font-medium text-bizzi-blue hover:underline"
                      >
                        Select all in view
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllInView}
                        disabled={visibleFileIdsForBulkSelect.length === 0}
                        className="text-xs font-medium text-neutral-600 hover:underline disabled:opacity-40 dark:text-neutral-400"
                      >
                        Deselect all in view
                      </button>
                    </div>
                  )}

                  {listLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                    </div>
                  ) : (
                    <div
                      ref={gridRef}
                      className="relative min-h-[200px] select-none"
                      onMouseDown={startMarquee}
                    >
                      {rubber && rubber.width + rubber.height > 0 && (
                        <div
                          className="pointer-events-none absolute z-20 border-2 border-bizzi-blue bg-bizzi-blue/10"
                          style={{
                            left: rubber.left,
                            top: rubber.top,
                            width: rubber.width,
                            height: rubber.height,
                          }}
                        />
                      )}
                      {!legacyFlatDrive && folders.length > 0 && (
                        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {folders.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              data-gallery-pick-tile="folder"
                              onClick={() => enterFolder(f)}
                              className="flex items-center gap-2 rounded-lg border border-neutral-200 p-3 text-left text-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                            >
                              <Folder className="h-6 w-6 shrink-0 text-amber-600" />
                              <span className="min-w-0 truncate font-medium">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                        {folderFiles.map((f) => (
                          <PickFileTile
                            key={f.id}
                            file={f}
                            selected={selectedIds.has(f.id)}
                            onToggle={() => toggleSelect(f.id)}
                            onPickToggle={(add) => {
                              if (add) addManyToSelection([f.id]);
                              else toggleSelect(f.id);
                            }}
                          />
                        ))}
                      </div>
                      {folderFiles.length === 0 && !listLoading && (
                        <p className="py-8 text-center text-sm text-neutral-500">
                          No matching {isVideoGallery ? "videos" : "photos"} in this folder.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {tab === "recent" && (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={selectAllInView}
                  className="text-xs font-medium text-bizzi-blue hover:underline"
                >
                  Select all in view
                </button>
                <button
                  type="button"
                  onClick={deselectAllInView}
                  disabled={visibleFileIdsForBulkSelect.length === 0}
                  className="text-xs font-medium text-neutral-600 hover:underline disabled:opacity-40 dark:text-neutral-400"
                >
                  Deselect all in view
                </button>
              </div>
              <div
                ref={gridRef}
                className="relative min-h-[200px] select-none"
                onMouseDown={startMarquee}
              >
                {rubber && rubber.width + rubber.height > 0 && (
                  <div
                    className="pointer-events-none absolute z-20 border-2 border-bizzi-blue bg-bizzi-blue/10"
                    style={{
                      left: rubber.left,
                      top: rubber.top,
                      width: rubber.width,
                      height: rubber.height,
                    }}
                  />
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {recentEligibleFiles.slice(0, 200).map((f) => (
                    <PickFileTile
                      key={f.id}
                      file={f}
                      selected={selectedIds.has(f.id)}
                      onToggle={() => toggleSelect(f.id)}
                      onPickToggle={(add) => {
                        if (add) addManyToSelection([f.id]);
                        else toggleSelect(f.id);
                      }}
                    />
                  ))}
                </div>
                {recentEligibleFiles.length === 0 && (
                  <p className="py-8 text-center text-sm text-neutral-500">
                    {isVideoGallery
                      ? "No video files in recent uploads. Upload some videos first."
                      : "No image files in recent uploads. Upload some photos first."}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 p-4 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Drag on empty space to select multiple · Shift or Ctrl/⌘ + click · Select or deselect all
            in view above the grid
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onAdd}
              disabled={adding || selectedIds.size === 0}
              className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
