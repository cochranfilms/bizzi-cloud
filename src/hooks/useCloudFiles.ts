"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import {
  getCurrentUserIdToken,
  getUserIdToken,
  isFirebaseAuthQuotaExceededError,
  registerFirebaseAuthQuotaCooldown,
} from "@/lib/auth-token";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import type { LinkedDrive } from "@/types/backup";
import { usePathname } from "next/navigation";
import {
  STORAGE_UPLOAD_COMPLETE_EVENT,
  type StorageUploadCompleteDetail,
} from "@/lib/storage-upload-complete-event";
import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import {
  recentFileFromMacosPackageListEntry,
  type MacosPackageListEntry,
} from "@/lib/macos-package-display";
import { backupPathUnderPrefix } from "@/lib/storage-virtual-folder-key";
import { MOVE_ALREADY_AT_DESTINATION, DUPLICATE_LINKED_FOLDER_NAME, linkedDriveDisplayKey } from "@/lib/move-and-folder-naming";
import { fetchPackagesListCached } from "@/lib/packages-list-cache";
import {
  BACKUP_LIFECYCLE_ACTIVE,
  BACKUP_LIFECYCLE_TRASHED,
  isBackupFileActiveForListing,
  resolveBackupFileLifecycleState,
} from "@/lib/backup-file-lifecycle";
import { COLLECTION_STORAGE_FOLDERS } from "@/lib/storage-folders/types";
import {
  registerCloudFilesPostMutationRefresh,
  scheduleCloudFilesPostMutationRefresh,
} from "@/lib/cloud-files-post-mutation-refresh";
import { dedupeScopedPillarDrives } from "@/lib/linked-drive-pillar-dedupe";

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return (data?.error as string) ?? fallback;
}

export function filterScopedLinkedDrives(
  drives: LinkedDrive[],
  opts: {
    isEnterpriseContext: boolean;
    orgId: string | null;
    creatorOnly: boolean;
    teamRouteOwnerUid: string | null;
  }
): LinkedDrive[] {
  return drives
    .filter((d) => {
      if (opts.teamRouteOwnerUid) {
        return d.personal_team_owner_id === opts.teamRouteOwnerUid;
      }
      if (d.personal_team_owner_id) return false;
      const oid = d.organization_id ?? null;
      if (opts.isEnterpriseContext && opts.orgId) return oid === opts.orgId;
      return !oid;
    })
    .filter((d) => {
      if (opts.isEnterpriseContext && opts.orgId && d.is_org_shared === true) {
        return false;
      }
      const creatorSection = d.creator_section === true;
      const isCreatorRaw = d.is_creator_raw === true;
      if (opts.creatorOnly) return creatorSection;
      return !creatorSection || isCreatorRaw;
    });
}

/** Client query: trashed `storage_folders` rows for a linked drive (v2). */
function trashedStorageFoldersClientQuery(db: Firestore, drive: LinkedDrive) {
  return drive.organization_id
    ? query(
        collection(db, COLLECTION_STORAGE_FOLDERS),
        where("linked_drive_id", "==", drive.id),
        where("organization_id", "==", drive.organization_id),
        where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED),
        limit(500)
      )
    : query(
        collection(db, COLLECTION_STORAGE_FOLDERS),
        where("linked_drive_id", "==", drive.id),
        where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED),
        limit(500)
      );
}

function collectTrashedSubtreeStorageFolderIds(
  rootId: string,
  folderDocs: QueryDocumentSnapshot<DocumentData>[]
): Set<string> {
  const subs = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const p = queue.shift()!;
    for (const doc of folderDocs) {
      const pdata = doc.data();
      if (
        pdata.parent_folder_id === p &&
        pdata.lifecycle_state === BACKUP_LIFECYCLE_TRASHED
      ) {
        if (!subs.has(doc.id)) {
          subs.add(doc.id);
          queue.push(doc.id);
        }
      }
    }
  }
  return subs;
}

function isTeamSharedDrive(d: LinkedDrive | undefined): boolean {
  return !!d?.personal_team_owner_id;
}

/** Bulk ops / share: list all files on this drive (org + team are multi-uploader). */
function shouldQueryDriveWideFiles(d: LinkedDrive | undefined, uid: string): boolean {
  if (!d) return false;
  if (d.organization_id) return true;
  if (isTeamSharedDrive(d)) return true;
  return d.user_id === uid;
}

/** Drive-level mutations (nested folders, etc.): owner, enterprise org admin, or team owner container. Server still enforces seats. */
export function actorMayMutateLinkedDriveContents(
  drive: LinkedDrive | undefined,
  actorUid: string,
  options: {
    enterpriseOrgId: string | null | undefined;
    enterpriseRole: string | null | undefined;
    isEnterpriseContext: boolean;
  }
): boolean {
  if (!drive) return false;
  if (drive.user_id === actorUid) return true;
  const orgId = drive.organization_id ?? null;
  if (orgId) {
    const inCtx =
      options.isEnterpriseContext &&
      !!options.enterpriseOrgId &&
      options.enterpriseOrgId === orgId;
    if (inCtx && options.enterpriseRole === "admin") return true;
    return false;
  }
  if (drive.personal_team_owner_id) {
    return drive.user_id === actorUid;
  }
  return false;
}

/** Matches server trash/move policy so drive owners and org admins can move others’ files (e.g. team home). */
function actorMayMoveBackupFile(
  data: DocumentData,
  actorUid: string,
  linkedDrives: LinkedDrive[],
  options: {
    enterpriseOrgId: string | null | undefined;
    enterpriseRole: string | null | undefined;
    isEnterpriseContext: boolean;
  }
): boolean {
  const uploader = (data.userId ?? data.user_id) as string | undefined;
  const fileOrgId = (data.organization_id as string | null) ?? null;
  const driveId = (data.linked_drive_id as string) ?? "";

  if (fileOrgId) {
    const inCtx =
      options.isEnterpriseContext &&
      !!options.enterpriseOrgId &&
      options.enterpriseOrgId === fileOrgId;
    if (inCtx && options.enterpriseRole === "admin") return true;
    if (uploader === actorUid) return true;
    return false;
  }

  if (driveId) {
    const drive = linkedDrives.find((d) => d.id === driveId);
    if (drive?.user_id === actorUid) return true;
  }

  return uploader === actorUid;
}

function backupModifiedMs(data: DocumentData): number {
  const m = data.modified_at;
  if (!m) return 0;
  if (typeof m === "string") return new Date(m).getTime();
  if (typeof (m as { toDate?: () => Date }).toDate === "function")
    return (m as { toDate: () => Date }).toDate().getTime();
  return 0;
}

const TRASH_API_BATCH = 200;

export function storageListRowToRecentFile(
  raw: Record<string, unknown>,
  driveId: string,
  driveName: string
): RecentFile {
  const fileName =
    String(raw.file_name ?? "").trim() ||
    (String(raw.relative_path ?? "").split("/").filter(Boolean).pop() ?? "");
  const path = String(raw.relative_path ?? (fileName || ""));
  const mod = raw.modified_at;
  let modifiedAt: string | null = null;
  if (typeof mod === "string") modifiedAt = mod;
  else if (mod && typeof (mod as { toDate?: () => Date }).toDate === "function") {
    modifiedAt = (mod as { toDate: () => Date }).toDate().toISOString();
  }
  const up = raw.uploaded_at;
  let uploadedAt: string | null = null;
  if (typeof up === "string") uploadedAt = up;
  else if (up && typeof (up as { toDate?: () => Date }).toDate === "function") {
    uploadedAt = (up as { toDate: () => Date }).toDate().toISOString();
  }
  return {
    id: String(raw.id ?? ""),
    name: fileName || path.split("/").pop() || "?",
    path,
    objectKey: String(raw.object_key ?? ""),
    size: Number(raw.size_bytes ?? 0),
    modifiedAt,
    uploadedAt,
    driveId,
    driveName,
    contentType: (raw.content_type as string) ?? null,
    assetType: (raw.asset_type as string) ?? null,
    galleryId: (raw.gallery_id as string) ?? null,
    proxyStatus: (raw.proxy_status as RecentFile["proxyStatus"]) ?? null,
    folder_id: (raw.folder_id as string) ?? null,
    file_name: (raw.file_name as string) ?? fileName ?? null,
    macosPackageId: (raw.macos_package_id as string) ?? null,
    resolution_w: raw.resolution_w != null ? Number(raw.resolution_w) : null,
    resolution_h: raw.resolution_h != null ? Number(raw.resolution_h) : null,
    duration_sec: raw.duration_sec != null ? Number(raw.duration_sec) : null,
    video_codec: (raw.video_codec as string) ?? null,
    width: raw.width != null ? Number(raw.width) : null,
    height: raw.height != null ? Number(raw.height) : null,
    videoThumbnailRev:
      raw.videoThumbnailRev != null && Number.isFinite(Number(raw.videoThumbnailRev))
        ? Number(raw.videoThumbnailRev)
        : 0,
  };
}

/** First previewable file in folder (for folder tile cover). From storage-folders list API. */
export type StorageFolderCoverFile = {
  object_key: string;
  file_name: string;
  content_type: string | null;
};

/** Narrow folder row from storage-folders list API for UI and picker (not full Firestore). */
export type StorageFolderListFolder = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  path_ids: string[];
  depth: number;
  version: number;
  operation_state: string;
  lifecycle_state: string;
  updated_at: string | null;
  /** Direct child folders + files (matches home tile counts; file branch capped at 500). */
  item_count: number;
  /** Earliest suitable thumbnail among first files in folder (image / video / PDF). */
  cover_file: StorageFolderCoverFile | null;
  /** System roots (e.g. Transfers) — UI should match server trash/move guards. */
  system_folder_role?: string | null;
  protected_deletion?: boolean;
};

/** Lists one level of a folder model v2 Storage drive via API. */
export async function fetchStorageFolderList(
  driveId: string,
  parentFolderId: string | null,
  driveName: string
): Promise<{
  folders: StorageFolderListFolder[];
  files: RecentFile[];
  listError: string | null;
}> {
  const auth = getFirebaseAuth().currentUser;
  if (!auth) return { folders: [], files: [], listError: null };
  const token = await getUserIdToken(auth, false);
  if (!token) return { folders: [], files: [], listError: null };
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const qs = new URLSearchParams({ drive_id: driveId });
  if (parentFolderId) qs.set("parent_folder_id", parentFolderId);
  const res = await fetch(`${base}/api/storage-folders/list?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = `Could not load Storage folders (${res.status})`;
    try {
      const errBody = (await res.json()) as { error?: unknown };
      if (typeof errBody.error === "string" && errBody.error.trim()) msg = errBody.error;
    } catch {
      /* ignore */
    }
    return { folders: [], files: [], listError: msg };
  }
  const data = (await res.json()) as {
    folders?: Array<Record<string, unknown>>;
    files?: Array<Record<string, unknown>>;
  };
  const folders: StorageFolderListFolder[] = (data.folders ?? []).map((f) => {
    const ua = f.updated_at as unknown;
    let updated_at: string | null = null;
    if (typeof ua === "string") updated_at = ua;
    else if (ua && typeof (ua as { toDate?: () => Date }).toDate === "function") {
      updated_at = (ua as { toDate: () => Date }).toDate().toISOString();
    }
    const ic = f.item_count;
    const item_count =
      typeof ic === "number" && Number.isFinite(ic) ? Math.max(0, Math.floor(ic)) : 0;
    const rawCover = f.cover_file as Record<string, unknown> | null | undefined;
    let cover_file: StorageFolderCoverFile | null = null;
    if (rawCover && typeof rawCover.object_key === "string" && rawCover.object_key.trim()) {
      cover_file = {
        object_key: rawCover.object_key.trim(),
        file_name: String(rawCover.file_name ?? ""),
        content_type:
          typeof rawCover.content_type === "string" ? rawCover.content_type : null,
      };
    }
    const sfr = f.system_folder_role;
    const system_folder_role =
      typeof sfr === "string" && sfr.trim() ? sfr.trim() : sfr === null ? null : undefined;
    const pd = f.protected_deletion;
    const protected_deletion = pd === true;
    return {
      id: String(f.id ?? ""),
      name: String(f.name ?? ""),
      parent_folder_id: (f.parent_folder_id as string | null) ?? null,
      path_ids: Array.isArray(f.path_ids) ? [...(f.path_ids as string[])] : [],
      depth: typeof f.depth === "number" ? f.depth : Number(f.depth ?? 0),
      version: typeof f.version === "number" ? f.version : Number(f.version ?? 1),
      operation_state: String(f.operation_state ?? "ready"),
      lifecycle_state: String(f.lifecycle_state ?? "active"),
      updated_at,
      item_count,
      cover_file,
      ...(system_folder_role !== undefined ? { system_folder_role } : {}),
      ...(protected_deletion ? { protected_deletion: true as const } : {}),
    };
  });
  const files = (data.files ?? []).map((raw) =>
    storageListRowToRecentFile(raw, driveId, driveName)
  );
  return { folders, files, listError: null };
}

/** Drive detail views need the full tree; filter API is paginated (max 120/page). */
const MAX_FILES_DRIVE_LIST = 25_000;
const DRIVE_LIST_PAGE_SIZE = 120;

async function reconcileMacosPackageForBackupFileClient(backupFileId: string): Promise<void> {
  const auth = getFirebaseAuth().currentUser;
  if (!auth) return;
  try {
    const token = await getUserIdToken(auth, true);
    if (!token) return;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    await fetch(`${base}/api/files/reconcile-macos-package`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ backup_file_id: backupFileId }),
    });
  } catch {
    /* package aggregates best-effort */
  }
}

async function trashBackupFileIdsViaApi(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const auth = getFirebaseAuth().currentUser;
  if (!auth) throw new Error("Not signed in");
  const token = await getUserIdToken(auth, true);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  for (let i = 0; i < fileIds.length; i += TRASH_API_BATCH) {
    const chunk = fileIds.slice(i, i + TRASH_API_BATCH);
    const res = await fetch(`${base}/api/files/trash`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ file_ids: chunk }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data?.error as string) ?? "Failed to move files to trash");
    }
  }
}

export interface DriveFolder {
  id: string;
  name: string;
  type: "folder";
  key: string;
  items: number;
  lastSyncedAt: string | null;
  /** When true, this is the permanent RAW drive (video-only, cannot delete). */
  isCreatorRaw?: boolean;
}

function mergeDriveFoldersFromScoped(scoped: LinkedDrive[], prev: DriveFolder[]): DriveFolder[] {
  const prevById = new Map(prev.map((f) => [f.id, f]));
  return scoped.map((drive) => {
    const prevRow = prevById.get(drive.id);
    return {
      id: drive.id,
      name: drive.name,
      type: "folder" as const,
      key: `drive-${drive.id}`,
      items: prevRow?.items ?? 0,
      lastSyncedAt: drive.last_synced_at ?? null,
      isCreatorRaw: drive.is_creator_raw === true,
    };
  });
}

/** First-level entries under Storage for home "Bizzi Cloud Folders": path prefixes from files and/or v2 `storage_folders` roots. */
export interface StorageTopFolderEntry {
  driveId: string;
  name: string;
  pathPrefix: string;
  itemCount: number;
  storageFolderId?: string;
  storageFolderVersion?: number;
  storageFolderOperationState?: string;
  storageFolderLifecycleState?: string;
  /** System roots (e.g. Transfers) — align home tiles with FileGrid / API guards. */
  systemFolderRole?: string | null;
  protectedDeletion?: boolean;
  /** Same cover resolution as `/api/storage-folders/list` (v2 roots only). */
  coverFile?: StorageFolderCoverFile | null;
}

export interface DeletedDrive {
  id: string;
  name: string;
  items: number;
  deletedAt: string | null;
}

/** Root of a trashed v2 storage subtree (nested folders + files restore together via API). */
export interface DeletedStorageFolder {
  id: string;
  name: string;
  driveId: string;
  driveName: string;
  /** Nested trashed folders (excl. root) + trashed files under this root (from a capped file sample per drive). */
  items: number;
  deletedAt: string | null;
  version: number;
}

/** Contents of one trashed Storage v2 folder (drill-down inside Deleted). */
export interface TrashedStorageFolderContents {
  /** Topmost trashed ancestor → current folder (inclusive). */
  path: Array<{ id: string; name: string }>;
  current: DeletedStorageFolder;
  subfolders: DeletedStorageFolder[];
  files: RecentFile[];
}

export type ProxyStatus =
  | "none"
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "raw_unsupported";

export interface RecentFile {
  id: string;
  name: string;
  path: string;
  objectKey: string;
  size: number;
  modifiedAt: string | null;
  driveId: string;
  driveName: string;
  /** Ingest / Firestore created_at (ISO) — display fallback for modified */
  createdAt?: string | null;
  /** Proxy transcode duration (seconds) when original duration missing */
  proxyDurationSec?: number | null;
  /** backup_files media_type */
  mediaType?: string | null;
  /** MIME type from upload - persists across rename, used for video thumbnail detection */
  contentType?: string | null;
  /** Finer-grained classification: project_file, archive, etc. */
  assetType?: string | null;
  /** When set, file is in trash */
  deletedAt?: string | null;
  /** When set, file is in Gallery Media and belongs to this gallery (enables stable folder grouping) */
  galleryId?: string | null;
  /** Video proxy status (ready, pending, failed, raw_unsupported, etc.) */
  proxyStatus?: ProxyStatus | null;
  /** Server-side time the file row was created on upload (preferred for Recent Uploads). */
  uploadedAt?: string | null;
  /** Optional metadata from filter API / backup_files */
  resolution_w?: number | null;
  resolution_h?: number | null;
  duration_sec?: number | null;
  video_codec?: string | null;
  width?: number | null;
  height?: number | null;
  /** Part of a macOS package when browsed as a single file row; synthetic package rows use assetType macos_package. */
  macosPackageId?: string | null;
  macosPackageFileCount?: number | null;
  macosPackageLabel?: string | null;
  /** macOS package kind from API / container (e.g. `fcpbundle`). */
  macosPackageKind?: string | null;
  /** Creative registry (Projects, labels) */
  handlingModel?: string | null;
  creativeApp?: string | null;
  creativeDisplayLabel?: string | null;
  projectFileType?: string | null;
  /** Folder model v2 parent `storage_folders` id (null = drive root) */
  folder_id?: string | null;
  file_name?: string | null;
  /** Bumps when user sets custom video poster; refreshes grid thumbnail fetch. */
  videoThumbnailRev?: number;
}

/** Map /api/files/filter JSON row to RecentFile (enterprise path avoids client Firestore aggregation 403). */
/** ISO timestamp for “when this upload counts as recent” (upload time wins over file mtime). */
function recentUploadRecencyIso(file: RecentFile): string | null {
  const raw = file.uploadedAt ?? file.modifiedAt;
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** Maps /api/files/filter row to RecentFile (also used by gallery "From files" refetch). */
export function apiFileToRecentFile(
  raw: Record<string, unknown>,
  driveNameById: Map<string, string>
): RecentFile {
  const driveId = String(raw.driveId ?? "");
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    path: String(raw.path ?? ""),
    objectKey: String(raw.objectKey ?? ""),
    size: Number(raw.size ?? 0),
    modifiedAt: (raw.modifiedAt as string) ?? null,
    createdAt: (raw.createdAt as string) ?? null,
    proxyDurationSec:
      raw.proxyDurationSec != null && Number.isFinite(raw.proxyDurationSec as number)
        ? (raw.proxyDurationSec as number)
        : null,
    mediaType: (raw.mediaType as string) ?? null,
    driveId,
    driveName: String(
      raw.driveName ?? driveNameById.get(driveId) ?? "Unknown drive"
    ),
    contentType: (raw.contentType as string) ?? null,
    assetType: (raw.assetType as string) ?? null,
    galleryId: (raw.galleryId as string) ?? null,
    proxyStatus: (raw.proxyStatus as RecentFile["proxyStatus"]) ?? null,
    uploadedAt: (raw.uploadedAt as string) ?? null,
    macosPackageId: (raw.macos_package_id as string) ?? null,
    macosPackageFileCount: raw.macos_package_file_count != null ? Number(raw.macos_package_file_count) : null,
    macosPackageLabel: (raw.macos_package_label as string) ?? null,
    macosPackageKind: (raw.macos_package_kind as string) ?? null,
    resolution_w: (raw.resolution_w as number) ?? null,
    resolution_h: (raw.resolution_h as number) ?? null,
    duration_sec: (raw.duration_sec as number) ?? null,
    video_codec: (raw.video_codec as string) ?? null,
    width: (raw.width as number) ?? null,
    height: (raw.height as number) ?? null,
    handlingModel: (raw.handlingModel as string) ?? null,
    creativeApp: (raw.creativeApp as string) ?? null,
    creativeDisplayLabel: (raw.creativeDisplayLabel as string) ?? null,
    projectFileType: (raw.projectFileType as string) ?? null,
    videoThumbnailRev:
      raw.videoThumbnailRev != null && Number.isFinite(Number(raw.videoThumbnailRev))
        ? Number(raw.videoThumbnailRev)
        : 0,
  };
}

/** List files via Admin-backed filter API (avoids client Firestore rule / index issues for personal & team drives). */
async function fetchFilesFromFilterApi(
  user: User,
  options: {
    driveId?: string;
    teamOwnerUserId?: string | null;
    pageSize?: number;
    cursor?: string | null;
    enterprise?: { organizationId: string };
    /** When set with dateTo, filter uses upload time and sorts by uploaded_at (ingest order). */
    dateFrom?: string;
    dateTo?: string;
    /** NLE / interchange / creative project files + metadata (handled in post-filter). */
    creativeProjects?: boolean;
    /** Enterprise: scope listing to one workspace (must be accessible to the user). */
    workspaceId?: string | null;
  }
): Promise<{ files: RecentFile[]; nextCursor: string | null; hasMore: boolean }> {
  const token = await getUserIdToken(user, false);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams({
    sort: "newest",
    page_size: String(options.pageSize ?? 50),
  });
  if (options.driveId) params.set("drive_id", options.driveId);
  if (options.teamOwnerUserId) params.set("team_owner_id", options.teamOwnerUserId);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.dateFrom) params.set("date_from", options.dateFrom);
  if (options.dateTo) params.set("date_to", options.dateTo);
  if (options.creativeProjects) params.set("creative_projects", "true");
  if (options.workspaceId) params.set("workspace_id", options.workspaceId);
  if (options.enterprise) {
    params.set("context", "enterprise");
    params.set("organization_id", options.enterprise.organizationId);
  }
  const res = await fetch(`${base}/api/files/filter?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { files: [], nextCursor: null, hasMore: false };
  const data = (await res.json()) as {
    files?: Record<string, unknown>[];
    cursor?: string | null;
    hasMore?: boolean;
  };
  const emptyDriveNames = new Map<string, string>();
  return {
    files: (data.files ?? []).map((raw) => apiFileToRecentFile(raw, emptyDriveNames)),
    nextCursor: data.cursor ?? null,
    hasMore: data.hasMore === true,
  };
}

/** Walk filter API cursors until all files for the drive are loaded (caps at MAX_FILES_DRIVE_LIST). */
async function fetchAllDriveFilesViaFilterApi(
  user: User,
  options: {
    driveId: string;
    teamOwnerUserId?: string | null;
    enterprise?: { organizationId: string };
    workspaceId?: string | null;
  }
): Promise<{ files: RecentFile[]; listTruncated: boolean }> {
  const collected: RecentFile[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let listTruncated = false;
  for (let page = 0; page < 500; page++) {
    const { files, nextCursor, hasMore } = await fetchFilesFromFilterApi(user, {
      driveId: options.driveId,
      teamOwnerUserId: options.teamOwnerUserId,
      enterprise: options.enterprise,
      workspaceId: options.workspaceId,
      pageSize: DRIVE_LIST_PAGE_SIZE,
      cursor,
    });
    for (const f of files) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      collected.push(f);
    }
    if (collected.length >= MAX_FILES_DRIVE_LIST) {
      listTruncated = true;
      break;
    }
    if (!hasMore || !nextCursor) break;
    cursor = nextCursor;
  }
  return { files: collected, listTruncated };
}

/** True when pathname is under /enterprise (enterprise storage context). */
function useIsEnterpriseContext(): boolean {
  const pathname = usePathname();
  return typeof pathname === "string" && pathname.startsWith("/enterprise");
}

function useTeamRouteOwnerUid(): string | null {
  const pathname = usePathname();
  const m = typeof pathname === "string" ? /^\/team\/([^/]+)/.exec(pathname) : null;
  return m?.[1]?.trim() || null;
}

export interface UseCloudFilesOptions {
  /** When true, return only Creator section drives (incl. RAW). When false, exclude Creator drives. */
  creatorOnly?: boolean;
  /**
   * When false, do not fetch drive listing / recent files on this instance (for per-card hooks).
   * One subscriber per page should keep the default true so post-mutation refresh is registered.
   */
  subscribeDriveListing?: boolean;
}

export function useCloudFiles(options?: UseCloudFilesOptions) {
  const { user } = useAuth();
  const { org, role: orgRole } = useEnterprise();
  const isEnterpriseContext = useIsEnterpriseContext();
  const teamRouteOwnerUid = useTeamRouteOwnerUid();
  const { selectedWorkspaceId } = useCurrentFolder();
  const creatorOnly = options?.creatorOnly ?? false;
  const subscribeDriveListing = options?.subscribeDriveListing !== false;
  const {
    linkedDrives,
    storageVersion,
    bumpStorageVersion,
    unlinkDrive,
    fetchDrives,
    loading: backupDrivesLoading,
  } = useBackup();
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const driveFoldersRef = useRef<DriveFolder[]>([]);
  useEffect(() => {
    driveFoldersRef.current = driveFolders;
  }, [driveFolders]);
  const [storageTopFolders, setStorageTopFolders] = useState<StorageTopFolderEntry[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [recentUploads, setRecentUploads] = useState<RecentFile[]>([]);
  const [recentUploadsLoading, setRecentUploadsLoading] = useState(false);
  const [allFilesForTransfer, setAllFilesForTransfer] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAllFiles, setLoadingAllFiles] = useState(false);
  const [authQuotaExceeded, setAuthQuotaExceeded] = useState(false);
  const hasInitiallyLoadedRef = useRef(false);
  /** Discards overlapping fetchRecentUploads results (e.g. rapid storageVersion bumps). */
  const recentUploadsFetchIdRef = useRef(0);
  /** Supersedes in-flight fetchCloudFiles when linked_drives changes mid-request (avoids stale setDriveFolders wiping optimistic new folders). */
  const cloudFilesFetchGenRef = useRef(0);

  const orgId = org?.id ?? null;

  const fetchCloudFiles = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) {
      setDriveFolders([]);
      setStorageTopFolders([]);
      setRecentFiles([]);
      setLoading(false);
      return;
    }

    const gen = ++cloudFilesFetchGenRef.current;
    const isCurrent = () => gen === cloudFilesFetchGenRef.current;

    const isBackgroundRefetch = hasInitiallyLoadedRef.current;
    let deferFolderReveal = false;
    try {
      if (!isBackgroundRefetch) setLoading(true);
      setAuthQuotaExceeded(false);
      const db = getFirebaseFirestore();
      const scoped = filterScopedLinkedDrives(linkedDrives, {
        isEnterpriseContext,
        orgId,
        creatorOnly,
        teamRouteOwnerUid,
      });
      const scopedFolderTiles = dedupeScopedPillarDrives(scoped);

      // Match team workspace: do not paint an empty folder grid while linked_drives are still loading.
      // Enterprise used to flash empty→full when org + drives resolved out of sync.
      const awaitingWorkspaceDrives =
        backupDrivesLoading &&
        scoped.length === 0 &&
        ((isEnterpriseContext && !!orgId) ||
          (!!teamRouteOwnerUid && !isEnterpriseContext));
      if (awaitingWorkspaceDrives) {
        deferFolderReveal = true;
        return;
      }

      if (isCurrent()) {
        setDriveFolders(mergeDriveFoldersFromScoped(scopedFolderTiles, driveFoldersRef.current));
      }

      const driveMap = new Map(
        scoped.map((d) => [
          d.id,
          {
            id: d.id,
            name: d.name,
            last_synced_at: d.last_synced_at,
            is_creator_raw: d.is_creator_raw === true,
          },
        ])
      );
      const driveIds = new Set(scoped.map((d) => d.id));
      const driveNameById = new Map(scoped.map((d) => [d.id, d.name]));

      if (isEnterpriseContext && orgId) {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const token = await getUserIdToken(user, false);
        const driveIdsParam = scoped.map((d) => d.id).join(",");
        const wsQs =
          selectedWorkspaceId != null && selectedWorkspaceId !== ""
            ? `&workspace_id=${encodeURIComponent(selectedWorkspaceId)}`
            : "";

        const countP = fetch(
          `${base}/api/files/drive-item-counts?organization_id=${encodeURIComponent(orgId)}&drive_ids=${encodeURIComponent(driveIdsParam)}${wsQs}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(async (r) =>
          r.ok ? ((await r.json()) as { counts?: Record<string, number> }) : { counts: {} }
        );
        const recentP = fetch(
          `${base}/api/files/filter?context=enterprise&organization_id=${encodeURIComponent(orgId)}&sort=newest&page_size=120${wsQs}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(async (r) =>
          r.ok ? ((await r.json()) as { files?: Record<string, unknown>[] }) : { files: [] }
        );

        const countData = await countP;
        if (!isCurrent()) return;
        const countMap = countData.counts ?? {};
        const folders: DriveFolder[] = scoped.map((drive) => ({
          id: drive.id,
          name: drive.name,
          type: "folder" as const,
          key: `drive-${drive.id}`,
          items: countMap[drive.id] ?? 0,
          lastSyncedAt: drive.last_synced_at,
          isCreatorRaw: drive.is_creator_raw === true,
        }));
        setDriveFolders(folders);
        setStorageTopFolders([]);

        const recentData = await recentP;
        if (!isCurrent()) return;
        const recent: RecentFile[] = (recentData.files ?? [])
          .map((raw) => apiFileToRecentFile(raw, driveNameById))
          .filter((r) => driveIds.has(r.driveId))
          .slice(0, 120);
        setRecentFiles(recent);
      } else if (teamRouteOwnerUid && scoped.length > 0) {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const token = await getUserIdToken(user, false);
        const driveIdsParam = scoped.map((d) => d.id).join(",");
        const ownerParam = encodeURIComponent(teamRouteOwnerUid);

        const countP = fetch(
          `${base}/api/files/drive-item-counts?team_owner_id=${ownerParam}&drive_ids=${encodeURIComponent(driveIdsParam)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(async (r) =>
          r.ok ? ((await r.json()) as { counts?: Record<string, number> }) : { counts: {} }
        );
        const recentP = fetch(
          `${base}/api/files/filter?team_owner_id=${ownerParam}&sort=newest&page_size=120`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(async (r) =>
          r.ok ? ((await r.json()) as { files?: Record<string, unknown>[] }) : { files: [] }
        );

        const countData = await countP;
        if (!isCurrent()) return;
        const countMap = countData.counts ?? {};
        const folders: DriveFolder[] = scoped.map((drive) => ({
          id: drive.id,
          name: drive.name,
          type: "folder" as const,
          key: `drive-${drive.id}`,
          items: countMap[drive.id] ?? 0,
          lastSyncedAt: drive.last_synced_at,
          isCreatorRaw: drive.is_creator_raw === true,
        }));
        setDriveFolders(folders);

        const storageIdsTeam = scoped
          .filter((d) => (d.name === "Storage" || d.name === "Uploads") && d.is_creator_raw !== true)
          .map((d) => d.id);
        let topsTeam: StorageTopFolderEntry[] = [];
        if (storageIdsTeam.length > 0) {
          const rootsRes = await fetch(
            `${base}/api/files/storage-folder-roots?team_owner_id=${ownerParam}&drive_ids=${encodeURIComponent(storageIdsTeam.join(","))}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (rootsRes.ok) {
            const rootsData = (await rootsRes.json()) as {
              folders?: Array<{
                drive_id: string;
                name: string;
                path?: string;
                file_count?: number;
                storage_folder_id?: string;
                storage_folder_version?: number;
                operation_state?: string;
                lifecycle_state?: string;
                system_folder_role?: string;
                protected_deletion?: boolean;
                cover_file?: StorageFolderCoverFile | null;
              }>;
            };
            topsTeam = (rootsData.folders ?? []).map((f) => ({
              driveId: f.drive_id,
              name: f.name,
              pathPrefix: typeof f.path === "string" ? f.path : "",
              itemCount: typeof f.file_count === "number" ? f.file_count : 0,
              storageFolderId:
                typeof f.storage_folder_id === "string" ? f.storage_folder_id : undefined,
              storageFolderVersion:
                typeof f.storage_folder_version === "number"
                  ? f.storage_folder_version
                  : undefined,
              storageFolderOperationState:
                typeof f.operation_state === "string" ? f.operation_state : undefined,
              storageFolderLifecycleState:
                typeof f.lifecycle_state === "string" ? f.lifecycle_state : undefined,
              ...(typeof f.system_folder_role === "string" && f.system_folder_role.trim()
                ? { systemFolderRole: f.system_folder_role.trim() }
                : {}),
              ...(f.protected_deletion === true ? { protectedDeletion: true as const } : {}),
              coverFile: f.cover_file ?? null,
            }));
          }
        }
        if (!isCurrent()) return;
        setStorageTopFolders(topsTeam);

        const recentData = await recentP;
        if (!isCurrent()) return;
        const recent: RecentFile[] = (recentData.files ?? [])
          .map((raw) => apiFileToRecentFile(raw, driveNameById))
          .filter((r) => driveIds.has(r.driveId))
          .slice(0, 120);
        setRecentFiles(recent);
      } else {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const token = await getUserIdToken(user, false);
        const driveIdsParam = scoped.map((d) => d.id).join(",");
        const countP =
          driveIdsParam.length > 0
            ? fetch(
                `${base}/api/files/drive-item-counts?personal=1&drive_ids=${encodeURIComponent(driveIdsParam)}`,
                { headers: { Authorization: `Bearer ${token}` } }
              ).then(async (r) =>
                r.ok ? ((await r.json()) as { counts?: Record<string, number> }) : { counts: {} }
              )
            : Promise.resolve({ counts: {} } as { counts?: Record<string, number> });
        const recentP = (async (): Promise<RecentFile[]> => {
          const { files: list } = await fetchFilesFromFilterApi(user, {
            pageSize: 120,
            teamOwnerUserId: teamRouteOwnerUid,
          });
          return list.filter((r) => driveIds.has(r.driveId)).slice(0, 120);
        })();

        const countData = await countP;
        if (!isCurrent()) return;
        const countMap = countData.counts ?? {};
        const folders: DriveFolder[] = scoped.map((drive) => ({
          id: drive.id,
          name: drive.name,
          type: "folder" as const,
          key: `drive-${drive.id}`,
          items: countMap[drive.id] ?? 0,
          lastSyncedAt: drive.last_synced_at,
          isCreatorRaw: drive.is_creator_raw === true,
        }));
        setDriveFolders(folders);

        const storageIdsPers = scoped
          .filter((d) => (d.name === "Storage" || d.name === "Uploads") && d.is_creator_raw !== true)
          .map((d) => d.id);
        let topsPers: StorageTopFolderEntry[] = [];
        if (storageIdsPers.length > 0) {
          const rootsRes = await fetch(
            `${base}/api/files/storage-folder-roots?personal=1&drive_ids=${encodeURIComponent(storageIdsPers.join(","))}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (rootsRes.ok) {
            const rootsData = (await rootsRes.json()) as {
              folders?: Array<{
                drive_id: string;
                name: string;
                path?: string;
                file_count?: number;
                storage_folder_id?: string;
                storage_folder_version?: number;
                operation_state?: string;
                lifecycle_state?: string;
                system_folder_role?: string;
                protected_deletion?: boolean;
                cover_file?: StorageFolderCoverFile | null;
              }>;
            };
            topsPers = (rootsData.folders ?? []).map((f) => ({
              driveId: f.drive_id,
              name: f.name,
              pathPrefix: typeof f.path === "string" ? f.path : "",
              itemCount: typeof f.file_count === "number" ? f.file_count : 0,
              storageFolderId:
                typeof f.storage_folder_id === "string" ? f.storage_folder_id : undefined,
              storageFolderVersion:
                typeof f.storage_folder_version === "number"
                  ? f.storage_folder_version
                  : undefined,
              storageFolderOperationState:
                typeof f.operation_state === "string" ? f.operation_state : undefined,
              storageFolderLifecycleState:
                typeof f.lifecycle_state === "string" ? f.lifecycle_state : undefined,
              ...(typeof f.system_folder_role === "string" && f.system_folder_role.trim()
                ? { systemFolderRole: f.system_folder_role.trim() }
                : {}),
              ...(f.protected_deletion === true ? { protectedDeletion: true as const } : {}),
              coverFile: f.cover_file ?? null,
            }));
          }
        }
        if (!isCurrent()) return;
        setStorageTopFolders(topsPers);

        const recentList = await recentP;
        if (!isCurrent()) return;
        setRecentFiles(recentList);
      }
    } catch (err) {
      console.error("useCloudFiles:", err);
      if (!isCurrent()) return;
      if (isFirebaseAuthQuotaExceededError(err)) {
        registerFirebaseAuthQuotaCooldown();
        setAuthQuotaExceeded(true);
      } else {
        setDriveFolders([]);
        setStorageTopFolders([]);
        setRecentFiles([]);
      }
    } finally {
      hasInitiallyLoadedRef.current = true;
      if (!deferFolderReveal && isCurrent()) {
        setLoading(false);
      }
    }
  }, [
    user,
    isEnterpriseContext,
    orgId,
    creatorOnly,
    linkedDrives,
    teamRouteOwnerUid,
    backupDrivesLoading,
    selectedWorkspaceId,
  ]);

  useEffect(() => {
    if (!subscribeDriveListing) return;
    fetchCloudFiles();
  }, [subscribeDriveListing, fetchCloudFiles, storageVersion]);

  /** Fetches user files for the transfer picker via server-backed cursor pagination (capped). */
  const fetchAllFilesForTransfer = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) {
      setAllFilesForTransfer([]);
      return;
    }
    try {
      setLoadingAllFiles(true);
      const scoped = filterScopedLinkedDrives(linkedDrives, {
        isEnterpriseContext,
        orgId,
        creatorOnly,
        teamRouteOwnerUid,
      });
      const driveIds = new Set(scoped.map((d) => d.id));
      const driveNameById = new Map(scoped.map((d) => [d.id, d.name]));

      const workspaceArg =
        selectedWorkspaceId != null && selectedWorkspaceId !== ""
          ? selectedWorkspaceId
          : null;

      if (isEnterpriseContext && orgId) {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const token = await getUserIdToken(user, false);
        const collected: RecentFile[] = [];
        let cursor: string | null = null;
        while (collected.length < MAX_FILES_DRIVE_LIST) {
          const params = new URLSearchParams({
            context: "enterprise",
            organization_id: orgId,
            sort: "newest",
            page_size: String(DRIVE_LIST_PAGE_SIZE),
          });
          if (cursor) params.set("cursor", cursor);
          if (workspaceArg) params.set("workspace_id", workspaceArg);
          const res = await fetch(`${base}/api/files/filter?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) break;
          const data = (await res.json()) as {
            files?: Record<string, unknown>[];
            hasMore?: boolean;
            cursor?: string | null;
          };
          const list = data.files ?? [];
          for (const raw of list) {
            const r = apiFileToRecentFile(raw, driveNameById);
            if (driveIds.has(r.driveId)) collected.push(r);
            if (collected.length >= MAX_FILES_DRIVE_LIST) break;
          }
          if (!data.hasMore || !data.cursor) break;
          cursor = data.cursor;
        }
        setAllFilesForTransfer(collected);
        return;
      }

      const collected: RecentFile[] = [];
      const seen = new Set<string>();
      for (const drive of scoped) {
        if (collected.length >= MAX_FILES_DRIVE_LIST) break;
        const { files: merged, listTruncated } = await fetchAllDriveFilesViaFilterApi(user, {
          driveId: drive.id,
          teamOwnerUserId: teamRouteOwnerUid,
          enterprise: drive.organization_id
            ? { organizationId: drive.organization_id }
            : undefined,
          workspaceId: workspaceArg,
        });
        for (const f of merged) {
          if (!driveIds.has(f.driveId) || seen.has(f.id)) continue;
          seen.add(f.id);
          collected.push({
            ...f,
            driveName: drive.name ?? f.driveName,
          });
          if (collected.length >= MAX_FILES_DRIVE_LIST) break;
        }
        if (listTruncated && collected.length >= MAX_FILES_DRIVE_LIST) break;
      }
      const recentMs = (f: RecentFile) => {
        const m = f.modifiedAt;
        if (!m) return 0;
        if (typeof m === "string") return new Date(m).getTime();
        if (typeof (m as { toDate?: () => Date }).toDate === "function")
          return (m as { toDate: () => Date }).toDate().getTime();
        return 0;
      };
      collected.sort((a, b) => recentMs(b) - recentMs(a));
      setAllFilesForTransfer(collected);
    } catch (err) {
      console.error("fetchAllFilesForTransfer:", err);
      setAllFilesForTransfer([]);
    } finally {
      setLoadingAllFiles(false);
    }
  }, [
    user,
    isEnterpriseContext,
    orgId,
    creatorOnly,
    linkedDrives,
    teamRouteOwnerUid,
    selectedWorkspaceId,
  ]);

  const fetchDriveFiles = useCallback(
    async (
      driveId: string
    ): Promise<{ files: RecentFile[]; listTruncated: boolean }> => {
      if (!isFirebaseConfigured() || !user) return { files: [], listTruncated: false };
      const driveMeta = new Map(linkedDrives.map((d) => [d.id, d]));
      const drive = driveMeta.get(driveId);
      const driveNameById = new Map(linkedDrives.map((d) => [d.id, d.name]));
      const workspaceArg =
        selectedWorkspaceId != null && selectedWorkspaceId !== ""
          ? selectedWorkspaceId
          : null;

      if (drive?.organization_id) {
        const { files: merged, listTruncated } = await fetchAllDriveFilesViaFilterApi(user, {
          driveId,
          enterprise: { organizationId: drive.organization_id },
          workspaceId: workspaceArg,
        });
        return {
          files: merged.map((f) => ({
            ...f,
            driveName: drive?.name ?? driveNameById.get(f.driveId) ?? f.driveName,
          })),
          listTruncated,
        };
      }

      const { files: merged, listTruncated } = await fetchAllDriveFilesViaFilterApi(user, {
        driveId,
        teamOwnerUserId: teamRouteOwnerUid,
      });
      return {
        files: merged.map((f) => ({
          ...f,
          driveName: drive?.name ?? f.driveName,
        })),
        listTruncated,
      };
    },
    [user, linkedDrives, teamRouteOwnerUid, selectedWorkspaceId]
  );

  /** Fetches files uploaded to Storage in the past 7 days. Reference view—files live in Storage, not duplicated. */
  const fetchRecentUploads = useCallback(async (): Promise<RecentFile[]> => {
    if (!isFirebaseConfigured() || !user) {
      setRecentUploadsLoading(false);
      return [];
    }
    const runId = ++recentUploadsFetchIdRef.current;
    setRecentUploadsLoading(true);
    try {
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dateFromDay = recentCutoff.slice(0, 10);
    const dateToDay = new Date().toISOString().slice(0, 10);
    const storageDriveIds = linkedDrives
      .filter((d) => {
        const n = d.name.replace(/^\[Team\]\s+/, "");
        return n === "Storage" || n === "Uploads";
      })
      .map((d) => d.id);
    if (storageDriveIds.length === 0) {
      setRecentUploads([]);
      return [];
    }
    const driveMap = new Map(linkedDrives.map((d) => [d.id, d]));
    /** UI only shows 24 rows; a few pages per drive is enough without loading every bundle member. */
    const maxPagesPerDrive = 4;
    const perDrive = await Promise.all(
      storageDriveIds.map(async (driveId) => {
        if (runId !== recentUploadsFetchIdRef.current) return [];
        const drive = driveMap.get(driveId);
        const batch: RecentFile[] = [];
        try {
          let cursor: string | null = null;
          for (let page = 0; page < maxPagesPerDrive; page++) {
            let pageResult: {
              files: RecentFile[];
              nextCursor: string | null;
              hasMore: boolean;
            };
            if (drive?.organization_id) {
              pageResult = await fetchFilesFromFilterApi(user, {
                driveId,
                pageSize: 50,
                cursor,
                enterprise: { organizationId: drive.organization_id },
                workspaceId:
                  selectedWorkspaceId != null && selectedWorkspaceId !== ""
                    ? selectedWorkspaceId
                    : null,
                dateFrom: dateFromDay,
                dateTo: dateToDay,
              });
            } else {
              pageResult = await fetchFilesFromFilterApi(user, {
                driveId,
                teamOwnerUserId: teamRouteOwnerUid,
                pageSize: 50,
                cursor,
                dateFrom: dateFromDay,
                dateTo: dateToDay,
              });
            }
            const { files: rows, nextCursor, hasMore } = pageResult;
            for (const row of rows) {
              const dateStr = recentUploadRecencyIso(row);
              if (!dateStr || dateStr < recentCutoff) continue;
              batch.push({
                ...row,
                driveName: drive?.name ?? row.driveName ?? "Storage",
              });
            }
            if (!hasMore || !nextCursor || rows.length === 0) break;
            cursor = nextCursor;
          }
        } catch {
          return [];
        }
        return batch;
      })
    );
    const all = perDrive.flat();
    all.sort((a, b) => {
      const ta = new Date(recentUploadRecencyIso(a) ?? 0).getTime();
      const tb = new Date(recentUploadRecencyIso(b) ?? 0).getTime();
      return tb - ta;
    });
    const token = await getUserIdToken(user, false);
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const synthetics: RecentFile[] = [];
    const activePkgIds = new Set<string>();
    if (token && storageDriveIds.length > 0) {
      const pkgByDrive = await Promise.all(
        storageDriveIds.map(async (driveId) => {
          const drive = driveMap.get(driveId);
          const driveName = drive?.name ?? "Storage";
          if (runId !== recentUploadsFetchIdRef.current) {
            return { driveId, driveName, packages: [] as MacosPackageListEntry[] };
          }
          try {
            const packages = await fetchPackagesListCached({
              origin: base,
              token,
              driveId,
              folderPath: "",
              storageVersion,
            });
            return { driveId, driveName, packages };
          } catch {
            return { driveId, driveName, packages: [] as MacosPackageListEntry[] };
          }
        })
      );
      if (runId !== recentUploadsFetchIdRef.current) return [];
      for (const { driveId, driveName, packages } of pkgByDrive) {
        for (const p of packages) {
          const la = p.last_activity_at;
          if (!la || la < recentCutoff) continue;
          synthetics.push(recentFileFromMacosPackageListEntry(p, driveId, driveName));
          activePkgIds.add(p.id);
        }
      }
    }
    const merged: RecentFile[] = [...synthetics];
    for (const f of all) {
      if (f.macosPackageId && activePkgIds.has(f.macosPackageId)) continue;
      merged.push(f);
    }
    merged.sort((a, b) => {
      const ta = new Date(recentUploadRecencyIso(a) ?? 0).getTime();
      const tb = new Date(recentUploadRecencyIso(b) ?? 0).getTime();
      return tb - ta;
    });
    const dedup = new Map<string, RecentFile>();
    for (const f of merged) dedup.set(f.id, f);
    const result = [...dedup.values()].slice(0, 24);
    if (runId !== recentUploadsFetchIdRef.current) return result;
    setRecentUploads(result);
    return result;
    } catch {
      if (runId === recentUploadsFetchIdRef.current) setRecentUploads([]);
      return [];
    } finally {
      if (runId === recentUploadsFetchIdRef.current) setRecentUploadsLoading(false);
    }
  }, [user, linkedDrives, teamRouteOwnerUid, storageVersion, selectedWorkspaceId]);

  useEffect(() => {
    if (!subscribeDriveListing) return;
    void fetchRecentUploads();
  }, [subscribeDriveListing, fetchRecentUploads, storageVersion]);

  /** Per-file Uppy refresh for Recent uploads (debounced in modal), workspace-scoped like the files API. */
  useEffect(() => {
    if (!subscribeDriveListing) return;
    if (typeof window === "undefined") return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<StorageUploadCompleteDetail | undefined>).detail;
      const selected =
        selectedWorkspaceId != null && selectedWorkspaceId !== ""
          ? selectedWorkspaceId
          : null;
      if (selected != null) {
        const uploadWs =
          detail?.workspaceId != null && detail.workspaceId !== ""
            ? detail.workspaceId
            : null;
        if (uploadWs != null && uploadWs !== selected) return;
      }
      void fetchRecentUploads();
    };
    window.addEventListener(STORAGE_UPLOAD_COMPLETE_EVENT, handler);
    return () => window.removeEventListener(STORAGE_UPLOAD_COMPLETE_EVENT, handler);
  }, [subscribeDriveListing, fetchRecentUploads, selectedWorkspaceId]);

  /** Subscribes to backup_files for a drive. Returns unsubscribe. Use for real-time updates (e.g. mount uploads). */
  const subscribeToDriveFiles = useCallback(
    (driveId: string, onFiles: (files: RecentFile[]) => void): (() => void) => {
      if (!isFirebaseConfigured() || !user) return () => {};
      const db = getFirebaseFirestore();
      const drive = linkedDrives.find((d) => d.id === driveId);
      if (drive?.organization_id) {
        const snapshotConstraints: QueryConstraint[] = [
          where("linked_drive_id", "==", driveId),
          where("organization_id", "==", drive.organization_id),
          where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE),
        ];
        if (selectedWorkspaceId != null && selectedWorkspaceId !== "") {
          snapshotConstraints.push(where("workspace_id", "==", selectedWorkspaceId));
        }
        snapshotConstraints.push(orderBy("modified_at", "desc"));
        const q = query(collection(db, "backup_files"), ...snapshotConstraints);
        return onSnapshot(q, (snap) => {
          const files: RecentFile[] = snap.docs
            .filter((d) => isBackupFileActiveForListing(d.data() as Record<string, unknown>))
            .map((d) => {
              const data = d.data();
              const path = data.relative_path ?? "";
              const name = (path.split("/").filter(Boolean).pop() ?? path) ?? "?";
              return {
                id: d.id,
                name,
                path,
                objectKey: data.object_key ?? "",
                size: data.size_bytes ?? 0,
                modifiedAt: data.modified_at ?? null,
                uploadedAt: data.uploaded_at?.toDate?.()
                  ? data.uploaded_at.toDate().toISOString()
                  : typeof data.uploaded_at === "string"
                    ? data.uploaded_at
                    : null,
                driveId: data.linked_drive_id,
                driveName: drive?.name ?? "Unknown drive",
                contentType: data.content_type ?? null,
                assetType: data.asset_type ?? null,
                galleryId: data.gallery_id ?? null,
                proxyStatus: data.proxy_status ?? null,
                macosPackageId: (data.macos_package_id as string) ?? null,
                resolution_w: data.resolution_w != null ? Number(data.resolution_w) : null,
                resolution_h: data.resolution_h != null ? Number(data.resolution_h) : null,
                duration_sec: data.duration_sec != null ? Number(data.duration_sec) : null,
                video_codec: (data.video_codec as string) ?? null,
                width: data.width != null ? Number(data.width) : null,
                height: data.height != null ? Number(data.height) : null,
                videoThumbnailRev:
                  data.video_thumbnail_rev != null && Number.isFinite(Number(data.video_thumbnail_rev))
                    ? Number(data.video_thumbnail_rev)
                    : 0,
              };
            });
          onFiles(files);
        });
      }

      let cancelled = false;
      const refresh = async () => {
        if (cancelled) return;
        const { files: merged } = await fetchAllDriveFilesViaFilterApi(user, {
          driveId,
          teamOwnerUserId: teamRouteOwnerUid,
        });
        onFiles(
          merged.map((f) => ({
            ...f,
            driveName: drive?.name ?? f.driveName,
          }))
        );
      };
      void refresh();
      /** Personal/team drives use filter API polling (not Firestore snapshot); keep interval short so post-extract-metadata columns update soon after Vercel finishes probing. */
      const tid =
        typeof window !== "undefined"
          ? window.setInterval(() => void refresh(), 5_000)
          : null;
      return () => {
        cancelled = true;
        if (tid != null) window.clearInterval(tid);
      };
    },
    [user, linkedDrives, teamRouteOwnerUid, selectedWorkspaceId]
  );

  /** Fetches RecentFile[] from backup_files by document IDs (default max 30, batched for Firestore 'in' limit of 10). */
  const fetchFilesByIds = useCallback(
    async (ids: string[], limitParam?: number): Promise<RecentFile[]> => {
      if (!isFirebaseConfigured() || !user || ids.length === 0) return [];
      const cap = limitParam != null ? Math.min(Math.max(1, limitParam), 50) : 30;
      const db = getFirebaseFirestore();
      const limited = ids.slice(0, cap);
      const driveMap = new Map(linkedDrives.map((d) => [d.id, d.name]));
      const allFiles: RecentFile[] = [];
      const IN_LIMIT = 10;
      for (let i = 0; i < limited.length; i += IN_LIMIT) {
        const chunk = limited.slice(i, i + IN_LIMIT);
        const filesSnap = await getDocs(
          query(collection(db, "backup_files"), where(documentId(), "in", chunk))
        );
        const missingDriveIds = [...new Set(
          filesSnap.docs
            .map((d) => d.data().linked_drive_id as string)
            .filter((id) => id && !driveMap.has(id))
        )];
        for (let j = 0; j < missingDriveIds.length; j += IN_LIMIT) {
          const driveChunk = missingDriveIds.slice(j, j + IN_LIMIT);
          const drivesSnap = await getDocs(
            query(collection(db, "linked_drives"), where(documentId(), "in", driveChunk))
          );
          drivesSnap.docs.forEach((d) => driveMap.set(d.id, d.data().name ?? "Folder"));
        }
        filesSnap.docs.forEach((d) => {
          const data = d.data();
          if (!isBackupFileActiveForListing(data as Record<string, unknown>)) return;
          const path = data.relative_path ?? "";
          const name = (path.split("/").filter(Boolean).pop()) ?? path ?? "?";
          allFiles.push({
            id: d.id,
            name,
            path,
            objectKey: data.object_key ?? "",
            size: data.size_bytes ?? 0,
            modifiedAt: data.modified_at ?? null,
            driveId: data.linked_drive_id,
            driveName: driveMap.get(data.linked_drive_id) ?? "Unknown drive",
            contentType: data.content_type ?? null,
            assetType: data.asset_type ?? null,
            galleryId: data.gallery_id ?? null,
            resolution_w: data.resolution_w != null ? Number(data.resolution_w) : null,
            resolution_h: data.resolution_h != null ? Number(data.resolution_h) : null,
            duration_sec: data.duration_sec != null ? Number(data.duration_sec) : null,
            video_codec: (data.video_codec as string) ?? null,
            width: data.width != null ? Number(data.width) : null,
            height: data.height != null ? Number(data.height) : null,
            videoThumbnailRev:
              data.video_thumbnail_rev != null && Number.isFinite(Number(data.video_thumbnail_rev))
                ? Number(data.video_thumbnail_rev)
                : 0,
          });
        });
      }
      return allFiles;
    },
    [user, linkedDrives]
  );

  const fetchDeletedFiles = useCallback(
    async (): Promise<RecentFile[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const scoped = filterScopedLinkedDrives(linkedDrives, {
        isEnterpriseContext,
        orgId,
        creatorOnly,
        teamRouteOwnerUid,
      });
      const driveMap = new Map(
        scoped.map((d) => [d.id, { id: d.id, name: d.name }])
      );
      const driveIds = new Set(driveMap.keys());
      const trashedFolderIdsByDrive = new Map<string, Set<string>>();
      await Promise.all(
        scoped.map(async (drive) => {
          const fsnap = await getDocs(trashedStorageFoldersClientQuery(db, drive));
          trashedFolderIdsByDrive.set(drive.id, new Set(fsnap.docs.map((fd) => fd.id)));
        })
      );
      /** Soft-deleted rows (deleted_at set). Filter client-side so restorable trash matches resolver: excludes pending_permanent_delete etc., and includes legacy rows without lifecycle_state. */
      const deletedAtLowerBound = Timestamp.fromMillis(0);
      const perDriveSnaps = await Promise.all(
        scoped.map((drive) =>
          getDocs(
            drive.organization_id
              ? query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", drive.id),
                  where("organization_id", "==", drive.organization_id),
                  where("deleted_at", ">", deletedAtLowerBound),
                  orderBy("deleted_at", "desc"),
                  limit(120)
                )
              : query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", drive.id),
                  where("deleted_at", ">", deletedAtLowerBound),
                  orderBy("deleted_at", "desc"),
                  limit(120)
                )
          )
        )
      );
      const trashedDocs = perDriveSnaps
        .flatMap((s) => s.docs)
        .filter(
          (d) =>
            resolveBackupFileLifecycleState(d.data() as Record<string, unknown>) ===
            BACKUP_LIFECYCLE_TRASHED
        )
        .filter((d) => {
          const data = d.data();
          const fid = data.folder_id as string | undefined;
          const dr = data.linked_drive_id as string;
          if (fid && trashedFolderIdsByDrive.get(dr)?.has(fid)) return false;
          return true;
        });
      return trashedDocs
        .filter((d) => driveIds.has(d.data().linked_drive_id))
        .map((d) => {
        const data = d.data();
        const path = data.relative_path ?? "";
        const name = (path.split("/").filter(Boolean).pop()) ?? path ?? "?";
        const drive = driveMap.get(data.linked_drive_id);
        const deletedAt = data.deleted_at?.toDate?.()
          ? data.deleted_at.toDate().toISOString()
          : typeof data.deleted_at === "string"
            ? data.deleted_at
            : null;
        return {
          id: d.id,
          name,
          path,
          objectKey: data.object_key ?? "",
          size: data.size_bytes ?? 0,
          modifiedAt: data.modified_at ?? null,
          driveId: data.linked_drive_id,
          driveName: drive?.name ?? "Unknown drive",
          contentType: data.content_type ?? null,
          assetType: data.asset_type ?? null,
          deletedAt: deletedAt ?? undefined,
          galleryId: data.gallery_id ?? null,
          videoThumbnailRev:
            data.video_thumbnail_rev != null && Number.isFinite(Number(data.video_thumbnail_rev))
              ? Number(data.video_thumbnail_rev)
              : 0,
        };
        });
    },
    [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives, teamRouteOwnerUid]
  );

  const fetchDeletedStorageFolders = useCallback(
    async (): Promise<DeletedStorageFolder[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const scoped = filterScopedLinkedDrives(linkedDrives, {
        isEnterpriseContext,
        orgId,
        creatorOnly,
        teamRouteOwnerUid,
      });
      const out: DeletedStorageFolder[] = [];

      for (const drive of scoped) {
        const folderSnaps = await getDocs(trashedStorageFoldersClientQuery(db, drive));
        const folderDocs = folderSnaps.docs;
        const byId = new Map(folderDocs.map((d) => [d.id, d]));
        const roots = folderDocs.filter((d) => {
          const pid = (d.data().parent_folder_id as string | null | undefined) ?? null;
          if (!pid) return true;
          const parent = byId.get(pid);
          if (!parent) return true;
          return parent.data().lifecycle_state !== BACKUP_LIFECYCLE_TRASHED;
        });

        const deletedAtLowerInner = Timestamp.fromMillis(0);
        const fileSnap = await getDocs(
          drive.organization_id
            ? query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", drive.id),
                where("organization_id", "==", drive.organization_id),
                where("deleted_at", ">", deletedAtLowerInner),
                limit(2500)
              )
            : query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", drive.id),
                where("deleted_at", ">", deletedAtLowerInner),
                limit(2500)
              )
        );

        const fileCountByFolder = new Map<string, number>();
        for (const fd of fileSnap.docs) {
          const data = fd.data();
          if (
            resolveBackupFileLifecycleState(data as Record<string, unknown>) !==
            BACKUP_LIFECYCLE_TRASHED
          ) {
            continue;
          }
          const fid = data.folder_id as string | undefined;
          if (!fid || !byId.has(fid)) continue;
          fileCountByFolder.set(fid, (fileCountByFolder.get(fid) ?? 0) + 1);
        }

        for (const doc of roots) {
          const subs = collectTrashedSubtreeStorageFolderIds(doc.id, folderDocs);
          let files = 0;
          for (const fid of subs) {
            files += fileCountByFolder.get(fid) ?? 0;
          }
          const nestedFolders = subs.size - 1;
          const items = nestedFolders + files;
          const dd = doc.data();
          const name = (dd.name as string) ?? "Folder";
          const v = typeof dd.version === "number" ? dd.version : Number(dd.version ?? 1);
          const ua = dd.updated_at;
          const deletedAt =
            ua && typeof ua === "object" && "toDate" in ua && typeof (ua as { toDate?: () => Date }).toDate === "function"
              ? (ua as { toDate: () => Date }).toDate().toISOString()
              : typeof ua === "string"
                ? ua
                : null;
          out.push({
            id: doc.id,
            name,
            driveId: drive.id,
            driveName: drive.name,
            items: Math.max(0, items),
            deletedAt,
            version: Number.isFinite(v) ? v : 1,
          });
        }
      }

      out.sort((a, b) => {
        const ta = a.deletedAt ? Date.parse(a.deletedAt) : 0;
        const tb = b.deletedAt ? Date.parse(b.deletedAt) : 0;
        return tb - ta;
      });
      return out;
    },
    [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives, teamRouteOwnerUid]
  );

  const fetchTrashedStorageFolderContents = useCallback(
    async (folderId: string): Promise<TrashedStorageFolderContents | null> => {
      if (!isFirebaseConfigured() || !user || !folderId) return null;
      const db = getFirebaseFirestore();
      const folderRef = doc(db, COLLECTION_STORAGE_FOLDERS, folderId);
      const folderSnap = await getDoc(folderRef);
      if (!folderSnap.exists()) return null;
      const rootData = folderSnap.data()!;
      if (rootData.lifecycle_state !== BACKUP_LIFECYCLE_TRASHED) return null;
      const driveId = String(rootData.linked_drive_id ?? "");
      if (!driveId) return null;
      const scoped = filterScopedLinkedDrives(linkedDrives, {
        isEnterpriseContext,
        orgId,
        creatorOnly,
        teamRouteOwnerUid,
      });
      const drive = scoped.find((d) => d.id === driveId);
      if (!drive) return null;

      const folderSnaps = await getDocs(trashedStorageFoldersClientQuery(db, drive));
      const folderDocs = folderSnaps.docs;
      const byId = new Map(folderDocs.map((d) => [d.id, d]));
      if (!byId.has(folderId)) return null;

      const path: Array<{ id: string; name: string }> = [];
      let cur: string | null = folderId;
      while (cur) {
        const pathDoc = byId.get(cur);
        if (!pathDoc) break;
        path.unshift({
          id: cur,
          name: (pathDoc.data().name as string) ?? "Folder",
        });
        const pid = (pathDoc.data().parent_folder_id as string | null | undefined) ?? null;
        cur = pid && byId.has(pid) ? pid : null;
      }

      const deletedAtLowerInner = Timestamp.fromMillis(0);
      const fileSnap = await getDocs(
        drive.organization_id
          ? query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", drive.id),
              where("organization_id", "==", drive.organization_id),
              where("deleted_at", ">", deletedAtLowerInner),
              limit(2500)
            )
          : query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", drive.id),
              where("deleted_at", ">", deletedAtLowerInner),
              limit(2500)
            )
      );

      const fileCountByFolder = new Map<string, number>();
      for (const fd of fileSnap.docs) {
        const data = fd.data();
        if (
          resolveBackupFileLifecycleState(data as Record<string, unknown>) !==
          BACKUP_LIFECYCLE_TRASHED
        ) {
          continue;
        }
        const fid = data.folder_id as string | undefined;
        if (!fid || !byId.has(fid)) continue;
        fileCountByFolder.set(fid, (fileCountByFolder.get(fid) ?? 0) + 1);
      }

      const driveNameById = new Map(scoped.map((d) => [d.id, d.name]));

      const childFolderDocs = folderDocs.filter((d) => {
        const pid = (d.data().parent_folder_id as string | null | undefined) ?? null;
        return pid === folderId;
      });

      const buildFolderRow = (doc: QueryDocumentSnapshot<DocumentData>): DeletedStorageFolder => {
        const subs = collectTrashedSubtreeStorageFolderIds(doc.id, folderDocs);
        let files = 0;
        for (const fid of subs) {
          files += fileCountByFolder.get(fid) ?? 0;
        }
        const nestedFolders = subs.size - 1;
        const items = nestedFolders + files;
        const dd = doc.data();
        const name = (dd.name as string) ?? "Folder";
        const v = typeof dd.version === "number" ? dd.version : Number(dd.version ?? 1);
        const ua = dd.updated_at;
        const deletedAt =
          ua &&
          typeof ua === "object" &&
          "toDate" in ua &&
          typeof (ua as { toDate?: () => Date }).toDate === "function"
            ? (ua as { toDate: () => Date }).toDate().toISOString()
            : typeof ua === "string"
              ? ua
              : null;
        return {
          id: doc.id,
          name,
          driveId: drive.id,
          driveName: drive.name,
          items: Math.max(0, items),
          deletedAt,
          version: Number.isFinite(v) ? v : 1,
        };
      };

      const subfolders = childFolderDocs.map((d) => buildFolderRow(d));
      subfolders.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

      const currentDoc = byId.get(folderId)!;
      const current = buildFolderRow(currentDoc);

      let filesQuery;
      if (drive.organization_id) {
        filesQuery = query(
          collection(db, "backup_files"),
          where("linked_drive_id", "==", drive.id),
          where("organization_id", "==", drive.organization_id),
          where("folder_id", "==", folderId),
          where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED),
          limit(500)
        );
      } else if (shouldQueryDriveWideFiles(drive, user.uid)) {
        filesQuery = query(
          collection(db, "backup_files"),
          where("linked_drive_id", "==", drive.id),
          where("folder_id", "==", folderId),
          where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED),
          limit(500)
        );
      } else {
        filesQuery = query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
          where("linked_drive_id", "==", drive.id),
          where("folder_id", "==", folderId),
          where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED),
          limit(500)
        );
      }

      const directFilesSnap = await getDocs(filesQuery);
      const files: RecentFile[] = directFilesSnap.docs
        .filter(
          (d) =>
            resolveBackupFileLifecycleState(d.data() as Record<string, unknown>) ===
            BACKUP_LIFECYCLE_TRASHED
        )
        .map((d) => {
          const data = d.data();
          const fpath = data.relative_path ?? "";
          const fname = (fpath.split("/").filter(Boolean).pop()) ?? fpath ?? "?";
          const deletedAt = data.deleted_at?.toDate?.()
            ? data.deleted_at.toDate().toISOString()
            : typeof data.deleted_at === "string"
              ? data.deleted_at
              : null;
          return {
            id: d.id,
            name: fname,
            path: fpath,
            objectKey: data.object_key ?? "",
            size: data.size_bytes ?? 0,
            modifiedAt: data.modified_at ?? null,
            driveId: data.linked_drive_id,
            driveName: driveNameById.get(data.linked_drive_id as string) ?? drive.name,
            contentType: data.content_type ?? null,
            assetType: data.asset_type ?? null,
            deletedAt: deletedAt ?? undefined,
            galleryId: data.gallery_id ?? null,
            videoThumbnailRev:
              data.video_thumbnail_rev != null && Number.isFinite(Number(data.video_thumbnail_rev))
                ? Number(data.video_thumbnail_rev)
                : 0,
          };
        });
      files.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
      );

      return { path, current, subfolders, files };
    },
    [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives, teamRouteOwnerUid]
  );

  const recalculateStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) return;
    try {
      const token = await getCurrentUserIdToken(false);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage/recalculate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) bumpStorageVersion();
    } catch (err) {
      console.error("Recalculate storage:", err);
    }
  }, [user, bumpStorageVersion]);

  useEffect(() => {
    if (!subscribeDriveListing) return;
    const run = () => {
      void fetchCloudFiles();
      void fetchRecentUploads();
      void recalculateStorage();
    };
    return registerCloudFilesPostMutationRefresh(run);
  }, [subscribeDriveListing, fetchCloudFiles, fetchRecentUploads, recalculateStorage]);

  /** After trash/restore/permanent-delete succeeds: coalesce refreshes (single subscriber registers the work). */
  const scheduleDebouncedPostTrashMetadataRefresh = useCallback(() => {
    scheduleCloudFilesPostMutationRefresh();
  }, []);

  /** Immediate client patch after mutation success — never call before the API succeeds. */
  const removeFileIdsFromLocalLists = useCallback((fileIds: string[]) => {
    const idSet = new Set(fileIds);
    setRecentFiles((prev) => prev.filter((f) => !idSet.has(f.id)));
    setRecentUploads((prev) => prev.filter((f) => !idSet.has(f.id)));
    setAllFilesForTransfer((prev) => prev.filter((f) => !idSet.has(f.id)));
  }, []);

  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      try {
        await trashBackupFileIdsViaApi([fileId]);
      } catch (e) {
        console.error(e);
        return;
      }
      removeFileIdsFromLocalLists([fileId]);
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, removeFileIdsFromLocalLists, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const deleteFiles = useCallback(
    async (fileIds: string[]) => {
      if (!isFirebaseConfigured() || !user || fileIds.length === 0) return;
      try {
        await trashBackupFileIdsViaApi(fileIds);
      } catch (e) {
        console.error(e);
        return;
      }
      removeFileIdsFromLocalLists(fileIds);
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, removeFileIdsFromLocalLists, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const restoreFile = useCallback(
    async (fileId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/files/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ file_ids: [fileId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to restore file");
      }
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const permanentlyDeleteFile = useCallback(
    async (fileId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/backup/permanent-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ file_ids: [fileId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to permanently delete");
      }
      removeFileIdsFromLocalLists([fileId]);
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, removeFileIdsFromLocalLists, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const renameFile = useCallback(
    async (fileId: string, newName: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/files/rename-backup-file`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ backup_file_id: fileId, new_name: newName }),
      });
      if (!res.ok) {
        throw new Error(await apiErrorMessage(res, "Failed to rename"));
      }
      await reconcileMacosPackageForBackupFileClient(fileId);
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const renameFolder = useCallback(
    async (driveId: string, newName: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const trimmed = newName.trim() || "Folder";
      const key = linkedDriveDisplayKey(trimmed);
      const dup = linkedDrives.some(
        (d) => d.id !== driveId && linkedDriveDisplayKey(d.name) === key
      );
      if (dup) {
        throw new Error(DUPLICATE_LINKED_FOLDER_NAME);
      }
      const db = getFirebaseFirestore();
      const driveRef = doc(db, "linked_drives", driveId);
      await updateDoc(driveRef, { name: trimmed });
      await fetchDrives();
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, linkedDrives, bumpStorageVersion, fetchDrives, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const moveFile = useCallback(
    async (fileId: string, targetDriveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const fileSnap = await getDoc(doc(db, "backup_files", fileId));
      if (!fileSnap.exists()) return;
      const data = fileSnap.data()!;
      if (
        !actorMayMoveBackupFile(data, user.uid, linkedDrives, {
          enterpriseOrgId: orgId,
          enterpriseRole: orgRole,
          isEnterpriseContext,
        })
      ) {
        return;
      }
      const sourceDriveId = (data.linked_drive_id as string) ?? "";
      if (sourceDriveId === targetDriveId) {
        throw new Error(MOVE_ALREADY_AT_DESTINATION);
      }
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/files/move-to-drive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file_ids: [fileId],
          target_drive_id: targetDriveId,
          target_folder_id: null,
        }),
      });
      if (!res.ok) {
        throw new Error(await apiErrorMessage(res, "Move failed"));
      }
      await reconcileMacosPackageForBackupFileClient(fileId);
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [
      user,
      linkedDrives,
      orgId,
      orgRole,
      isEnterpriseContext,
      bumpStorageVersion,
      scheduleDebouncedPostTrashMetadataRefresh,
    ]
  );

  const moveFilesToFolder = useCallback(
    async (fileIds: string[], targetDriveId: string) => {
      if (!isFirebaseConfigured() || !user || fileIds.length === 0) return;
      const db = getFirebaseFirestore();
      const moveOpts = {
        enterpriseOrgId: orgId,
        enterpriseRole: orgRole,
        isEnterpriseContext,
      };
      const snapshots = await Promise.all(
        fileIds.map((fileId) => getDoc(doc(db, "backup_files", fileId)))
      );
      const allowed: string[] = [];
      for (let i = 0; i < fileIds.length; i++) {
        const fileSnap = snapshots[i];
        if (!fileSnap.exists()) continue;
        const data = fileSnap.data()!;
        if (!actorMayMoveBackupFile(data, user.uid, linkedDrives, moveOpts)) continue;
        const sourceDriveId = (data.linked_drive_id as string) ?? "";
        if (sourceDriveId === targetDriveId) {
          throw new Error(MOVE_ALREADY_AT_DESTINATION);
        }
        allowed.push(fileIds[i]!);
      }
      if (allowed.length === 0) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/files/move-to-drive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file_ids: allowed,
          target_drive_id: targetDriveId,
          target_folder_id: null,
        }),
      });
      if (!res.ok) {
        throw new Error(await apiErrorMessage(res, "Move failed"));
      }
      await Promise.all(allowed.map((fileId) => reconcileMacosPackageForBackupFileClient(fileId)));
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [
      user,
      linkedDrives,
      orgId,
      orgRole,
      isEnterpriseContext,
      bumpStorageVersion,
      scheduleDebouncedPostTrashMetadataRefresh,
    ]
  );

  const moveFilesToStorageFolder = useCallback(
    async (fileIds: string[], targetFolderId: string | null) => {
      if (!isFirebaseConfigured() || !user || fileIds.length === 0) return;
      const db = getFirebaseFirestore();
      const moveOpts = {
        enterpriseOrgId: orgId,
        enterpriseRole: orgRole,
        isEnterpriseContext,
      };
      const snapshots = await Promise.all(
        fileIds.map((fileId) => getDoc(doc(db, "backup_files", fileId)))
      );
      const allowed: string[] = [];
      const tgt = targetFolderId ?? null;
      for (let i = 0; i < fileIds.length; i++) {
        const fileSnap = snapshots[i];
        if (!fileSnap.exists()) continue;
        const data = fileSnap.data()!;
        if (!actorMayMoveBackupFile(data, user.uid, linkedDrives, moveOpts)) continue;
        const curFolder = ((data.folder_id as string | null) ?? null) as string | null;
        if (curFolder === tgt) {
          throw new Error(MOVE_ALREADY_AT_DESTINATION);
        }
        allowed.push(fileIds[i]!);
      }
      if (allowed.length === 0) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      await Promise.all(
        allowed.map(async (file_id) => {
          const res = await fetch(`${base}/api/files/move-to-folder`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ file_id, target_folder_id: targetFolderId }),
          });
          if (!res.ok) {
            throw new Error(await apiErrorMessage(res, "Move failed"));
          }
          await reconcileMacosPackageForBackupFileClient(file_id);
        })
      );
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [
      user,
      linkedDrives,
      orgId,
      orgRole,
      isEnterpriseContext,
      bumpStorageVersion,
      scheduleDebouncedPostTrashMetadataRefresh,
    ]
  );

  const renameStorageFolder = useCallback(
    async (folderId: string, name: string, version: number) => {
      if (!user) throw new Error("Not signed in");
      const token = await getCurrentUserIdToken(true);
      if (!token) throw new Error("Not signed in");
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage-folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, version }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to rename folder");
      }
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const moveStorageFolder = useCallback(
    async (folderId: string, targetParentFolderId: string | null, version: number) => {
      if (!user) throw new Error("Not signed in");
      const token = await getCurrentUserIdToken(true);
      if (!token) throw new Error("Not signed in");
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage-folders/${encodeURIComponent(folderId)}/move`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_parent_folder_id: targetParentFolderId,
          version,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to move folder");
      }
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const collectActiveFileIdsUnderStoragePathPrefix = useCallback(
    async (driveId: string, pathPrefix: string): Promise<string[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const folderDrive = linkedDrives.find((d) => d.id === driveId);
      const snap = await getDocs(
        shouldQueryDriveWideFiles(folderDrive, user.uid)
          ? folderDrive?.organization_id
            ? query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", driveId),
                where("organization_id", "==", folderDrive.organization_id),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
            : query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", driveId),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
          : query(
              collection(db, "backup_files"),
              where("userId", "==", user.uid),
              where("linked_drive_id", "==", driveId),
              where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
            )
      );
      const ids: string[] = [];
      for (const d of snap.docs) {
        if (!isBackupFileActiveForListing(d.data() as Record<string, unknown>)) continue;
        const rel = String((d.data() as Record<string, unknown>).relative_path ?? "");
        if (!backupPathUnderPrefix(rel, pathPrefix)) continue;
        ids.push(d.id);
      }
      return ids;
    },
    [user, linkedDrives]
  );

  const collectActiveFileIdsInStorageV2Subtree = useCallback(
    async (driveId: string, rootFolderId: string): Promise<string[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const folderDrive = linkedDrives.find((d) => d.id === driveId);
      const folderIds = new Set<string>([rootFolderId]);
      const queue = [rootFolderId];
      while (queue.length) {
        const parent = queue.shift()!;
        const fq = query(
          collection(db, COLLECTION_STORAGE_FOLDERS),
          where("linked_drive_id", "==", driveId),
          where("parent_folder_id", "==", parent),
          where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
        );
        const sub = await getDocs(fq);
        for (const d of sub.docs) {
          if (!folderIds.has(d.id)) {
            folderIds.add(d.id);
            queue.push(d.id);
          }
        }
      }
      const snap = await getDocs(
        shouldQueryDriveWideFiles(folderDrive, user.uid)
          ? folderDrive?.organization_id
            ? query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", driveId),
                where("organization_id", "==", folderDrive.organization_id),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
            : query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", driveId),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
          : query(
              collection(db, "backup_files"),
              where("userId", "==", user.uid),
              where("linked_drive_id", "==", driveId),
              where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
            )
      );
      const ids: string[] = [];
      for (const d of snap.docs) {
        if (!isBackupFileActiveForListing(d.data() as Record<string, unknown>)) continue;
        const fid = (d.data() as Record<string, unknown>).folder_id as string | null | undefined;
        if (fid && folderIds.has(fid)) ids.push(d.id);
      }
      return ids;
    },
    [user, linkedDrives]
  );

  const trashAllFilesUnderStoragePath = useCallback(
    async (driveId: string, pathPrefix: string) => {
      const ids = await collectActiveFileIdsUnderStoragePathPrefix(driveId, pathPrefix);
      if (ids.length === 0) return;
      await trashBackupFileIdsViaApi(ids);
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [
      collectActiveFileIdsUnderStoragePathPrefix,
      bumpStorageVersion,
      scheduleDebouncedPostTrashMetadataRefresh,
    ]
  );

  const trashStorageFolderSubtree = useCallback(
    async (storageFolderId: string, version?: number) => {
      const token = await getCurrentUserIdToken(true);
      if (!token) throw new Error("Not signed in");
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/storage-folders/${encodeURIComponent(storageFolderId)}/trash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            typeof version === "number" && Number.isFinite(version) ? { version } : {}
          ),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to delete folder");
      }
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const restoreStorageFolder = useCallback(
    async (storageFolderId: string, version?: number) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/storage-folders/${encodeURIComponent(storageFolderId)}/restore`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            typeof version === "number" && Number.isFinite(version) ? { version } : {}
          ),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to restore folder");
      }
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const permanentlyDeleteStorageFolder = useCallback(
    async (storageFolderId: string, version?: number) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/storage-folders/${encodeURIComponent(storageFolderId)}/permanent-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            typeof version === "number" && Number.isFinite(version) ? { version } : {}
          ),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to permanently delete folder");
      }
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const moveAllFilesUnderStoragePath = useCallback(
    async (driveId: string, pathPrefix: string, targetDriveId: string) => {
      const ids = await collectActiveFileIdsUnderStoragePathPrefix(driveId, pathPrefix);
      if (ids.length === 0) return;
      await moveFilesToFolder(ids, targetDriveId);
    },
    [collectActiveFileIdsUnderStoragePathPrefix, moveFilesToFolder]
  );

  const getFileIdsForBulkShare = useCallback(
    async (
      fileIds: string[],
      folderDriveIds: string[],
      storagePathScopes?: { driveId: string; pathPrefix: string }[],
      storageV2FolderScopes?: { driveId: string; storageFolderId: string }[]
    ): Promise<string[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const ids = new Set<string>(fileIds);
      for (const driveId of folderDriveIds) {
        const folderDrive = linkedDrives.find((d) => d.id === driveId);
        const snap = await getDocs(
          shouldQueryDriveWideFiles(folderDrive, user.uid)
            ? folderDrive?.organization_id
              ? query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", driveId),
                  where("organization_id", "==", folderDrive.organization_id),
                  where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
                )
              : query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", driveId),
                  where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
                )
            : query(
                collection(db, "backup_files"),
                where("userId", "==", user.uid),
                where("linked_drive_id", "==", driveId),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
        );
        snap.docs
          .filter((d) => isBackupFileActiveForListing(d.data() as Record<string, unknown>))
          .forEach((d) => ids.add(d.id));
      }
      for (const scope of storagePathScopes ?? []) {
        const under = await collectActiveFileIdsUnderStoragePathPrefix(
          scope.driveId,
          scope.pathPrefix
        );
        under.forEach((id) => ids.add(id));
      }
      for (const v2 of storageV2FolderScopes ?? []) {
        const under = await collectActiveFileIdsInStorageV2Subtree(
          v2.driveId,
          v2.storageFolderId
        );
        under.forEach((id) => ids.add(id));
      }
      return Array.from(ids);
    },
    [
      user,
      linkedDrives,
      collectActiveFileIdsUnderStoragePathPrefix,
      collectActiveFileIdsInStorageV2Subtree,
    ]
  );

  const moveFolderContentsToFolder = useCallback(
    async (sourceDriveId: string, targetDriveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      if (sourceDriveId === targetDriveId) {
        throw new Error(MOVE_ALREADY_AT_DESTINATION);
      }
      const db = getFirebaseFirestore();
      const sourceDrive = linkedDrives.find((d) => d.id === sourceDriveId);
      const filesSnap = await getDocs(
        shouldQueryDriveWideFiles(sourceDrive, user.uid)
          ? sourceDrive?.organization_id
            ? query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", sourceDriveId),
                where("organization_id", "==", sourceDrive.organization_id),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
            : query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", sourceDriveId),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
          : query(
              collection(db, "backup_files"),
              where("userId", "==", user.uid),
              where("linked_drive_id", "==", sourceDriveId),
              where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
            )
      );
      for (const d of filesSnap.docs) {
        if (!isBackupFileActiveForListing(d.data() as Record<string, unknown>)) continue;
        const data = d.data();
        const path = (data.relative_path as string) ?? "";
        const fileName = (path.split("/").filter(Boolean).pop() ?? path) || "file";
        await updateDoc(doc(db, "backup_files", d.id), {
          linked_drive_id: targetDriveId,
          relative_path: fileName,
        });
        await reconcileMacosPackageForBackupFileClient(d.id);
      }
      if (sourceDrive) await unlinkDrive(sourceDrive);
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, linkedDrives, unlinkDrive, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const deleteFolder = useCallback(
    async (drive: { id: string; name: string }, itemCount: number) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      if (itemCount === 0) {
        const linkedDrive = linkedDrives.find((d) => d.id === drive.id);
        if (linkedDrive) await unlinkDrive(linkedDrive);
      } else {
        const linkedDriveMeta = linkedDrives.find((d) => d.id === drive.id);
        const filesSnap = await getDocs(
          shouldQueryDriveWideFiles(linkedDriveMeta, user.uid)
            ? linkedDriveMeta?.organization_id
              ? query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", drive.id),
                  where("organization_id", "==", linkedDriveMeta.organization_id),
                  where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
                )
              : query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", drive.id),
                  where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
                )
            : query(
                collection(db, "backup_files"),
                where("userId", "==", user.uid),
                where("linked_drive_id", "==", drive.id),
                where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
              )
        );
        const ids = filesSnap.docs
          .filter((d) => isBackupFileActiveForListing(d.data() as Record<string, unknown>))
          .map((d) => d.id);
        try {
          await trashBackupFileIdsViaApi(ids);
        } catch (e) {
          console.error(e);
          return;
        }
        await updateDoc(doc(db, "linked_drives", drive.id), {
          deleted_at: serverTimestamp(),
        });
        await fetchDrives();
      }
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [
      user,
      linkedDrives,
      unlinkDrive,
      fetchDrives,
      bumpStorageVersion,
      scheduleDebouncedPostTrashMetadataRefresh,
    ]
  );

  const fetchDeletedDrives = useCallback(async (): Promise<DeletedDrive[]> => {
    if (!isFirebaseConfigured() || !user) return [];
    const db = getFirebaseFirestore();
    const drivesSnap = await getDocs(
      query(
        collection(db, "linked_drives"),
        where("userId", "==", user.uid),
        where("deleted_at", "!=", null),
        orderBy("deleted_at", "desc")
      )
    );
    const drivesInContext = drivesSnap.docs.filter((d) => {
      const data = d.data();
      const oid = data.organization_id ?? null;
      if (isEnterpriseContext && orgId) return oid === orgId;
      return !oid;
    });

    let countMap: Record<string, number> = {};
    if (drivesInContext.length > 0) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const token = await getUserIdToken(user, false);
      const driveIdsParam = drivesInContext.map((d) => d.id).join(",");
      const countUrl =
        isEnterpriseContext && orgId
          ? `${base}/api/files/drive-item-counts?organization_id=${encodeURIComponent(orgId)}&drive_ids=${encodeURIComponent(driveIdsParam)}&deleted=only`
          : `${base}/api/files/drive-item-counts?personal=1&drive_ids=${encodeURIComponent(driveIdsParam)}&deleted=only`;
      const countRes = await fetch(countUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (countRes.ok) {
        const countData = (await countRes.json()) as { counts?: Record<string, number> };
        countMap = countData.counts ?? {};
      }
    }

    const result: DeletedDrive[] = [];
    for (const d of drivesInContext) {
      const data = d.data();
      const items = countMap[d.id] ?? 0;
      const deletedAt = data.deleted_at?.toDate?.()
        ? data.deleted_at.toDate().toISOString()
        : typeof data.deleted_at === "string"
          ? data.deleted_at
          : null;
      result.push({
        id: d.id,
        name: data.name ?? "Folder",
        items,
        deletedAt,
      });
    }
    return result;
  }, [user, isEnterpriseContext, orgId]);

  const restoreDrive = useCallback(
    async (driveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const sourceDrive = linkedDrives.find((d) => d.id === driveId);
      const deletedAtLowerBound = Timestamp.fromMillis(0);
      const filesSnap = await getDocs(
        sourceDrive?.organization_id
          ? query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", driveId),
              where("organization_id", "==", sourceDrive.organization_id),
              where("deleted_at", ">", deletedAtLowerBound),
              orderBy("deleted_at", "desc")
            )
          : query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", driveId),
              where("deleted_at", ">", deletedAtLowerBound),
              orderBy("deleted_at", "desc")
            )
      );
      const ids = filesSnap.docs
        .filter(
          (d) =>
            resolveBackupFileLifecycleState(d.data() as Record<string, unknown>) ===
            BACKUP_LIFECYCLE_TRASHED
        )
        .map((d) => d.id);
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const RESTORE_CHUNK = 200;
      for (let i = 0; i < ids.length; i += RESTORE_CHUNK) {
        const chunk = ids.slice(i, i + RESTORE_CHUNK);
        const res = await fetch(`${base}/api/files/restore`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ file_ids: chunk }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data?.error as string) ?? "Failed to restore files");
        }
      }
      await updateDoc(doc(db, "linked_drives", driveId), { deleted_at: null });
      await fetchDrives();
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, linkedDrives, fetchDrives, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  const permanentlyDeleteDrive = useCallback(
    async (driveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getCurrentUserIdToken(true);
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/backup/permanent-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ drive_id: driveId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) ?? "Failed to permanently delete");
      }
      await fetchDrives();
      bumpStorageVersion();
      scheduleDebouncedPostTrashMetadataRefresh();
    },
    [user, fetchDrives, bumpStorageVersion, scheduleDebouncedPostTrashMetadataRefresh]
  );

  return {
    driveFolders,
    /** Top-level path segments inside Storage (migration subfolders, etc.) for home folder grid. */
    storageTopFolders,
    recentFiles,
    recentUploads,
    /** True while the 7-day Storage recent-uploads query is in flight. */
    recentUploadsLoading,
    fetchRecentUploads,
    /** True when Firebase Auth token quota was exceeded on last refetch (transient; try again later). */
    authQuotaExceeded,
    allFilesForTransfer,
    loading,
    loadingAllFiles,
    refetch: fetchCloudFiles,
    fetchAllFilesForTransfer,
    fetchDriveFiles,
    subscribeToDriveFiles,
    fetchFilesByIds,
    fetchDeletedFiles,
    fetchDeletedDrives,
    fetchDeletedStorageFolders,
    fetchTrashedStorageFolderContents,
    deleteFile,
    deleteFiles,
    deleteFolder,
    restoreFile,
    restoreDrive,
    permanentlyDeleteFile,
    permanentlyDeleteDrive,
    renameFile,
    renameFolder,
    moveFile,
    moveFilesToFolder,
    moveFilesToStorageFolder,
    renameStorageFolder,
    moveStorageFolder,
    moveFolderContentsToFolder,
    getFileIdsForBulkShare,
    trashAllFilesUnderStoragePath,
    trashStorageFolderSubtree,
    restoreStorageFolder,
    permanentlyDeleteStorageFolder,
    moveAllFilesUnderStoragePath,
  };
}
