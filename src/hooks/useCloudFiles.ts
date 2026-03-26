"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  getCountFromServer,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import type { LinkedDrive } from "@/types/backup";
import { usePathname } from "next/navigation";
import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import type { User } from "firebase/auth";

function filterScopedLinkedDrives(
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

function personalDriveFilesCountQuery(db: Firestore, drive: LinkedDrive) {
  if (drive.organization_id) {
    return query(
      collection(db, "backup_files"),
      where("linked_drive_id", "==", drive.id),
      where("organization_id", "==", drive.organization_id),
      where("deleted_at", "==", null)
    );
  }
  return query(
    collection(db, "backup_files"),
    where("linked_drive_id", "==", drive.id),
    where("deleted_at", "==", null)
  );
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

async function trashBackupFileIdsViaApi(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const auth = getFirebaseAuth().currentUser;
  if (!auth) throw new Error("Not signed in");
  const token = await auth.getIdToken(true);
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

export interface DeletedDrive {
  id: string;
  name: string;
  items: number;
  deletedAt: string | null;
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

function apiFileToRecentFile(
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
    driveId,
    driveName: String(
      raw.driveName ?? driveNameById.get(driveId) ?? "Unknown drive"
    ),
    contentType: (raw.contentType as string) ?? null,
    assetType: (raw.assetType as string) ?? null,
    galleryId: (raw.galleryId as string) ?? null,
    proxyStatus: (raw.proxyStatus as RecentFile["proxyStatus"]) ?? null,
    uploadedAt: (raw.uploadedAt as string) ?? null,
    resolution_w: (raw.resolution_w as number) ?? null,
    resolution_h: (raw.resolution_h as number) ?? null,
    duration_sec: (raw.duration_sec as number) ?? null,
    video_codec: (raw.video_codec as string) ?? null,
    width: (raw.width as number) ?? null,
    height: (raw.height as number) ?? null,
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
  }
): Promise<{ files: RecentFile[]; nextCursor: string | null; hasMore: boolean }> {
  const token = await user.getIdToken(true);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams({
    sort: "newest",
    page_size: String(options.pageSize ?? 50),
  });
  if (options.driveId) params.set("drive_id", options.driveId);
  if (options.teamOwnerUserId) params.set("team_owner_id", options.teamOwnerUserId);
  if (options.cursor) params.set("cursor", options.cursor);
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
}

export function useCloudFiles(options?: UseCloudFilesOptions) {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const isEnterpriseContext = useIsEnterpriseContext();
  const teamRouteOwnerUid = useTeamRouteOwnerUid();
  const creatorOnly = options?.creatorOnly ?? false;
  const { linkedDrives, storageVersion, bumpStorageVersion, unlinkDrive, fetchDrives } = useBackup();
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [recentUploads, setRecentUploads] = useState<RecentFile[]>([]);
  const [recentUploadsLoading, setRecentUploadsLoading] = useState(false);
  const [allFilesForTransfer, setAllFilesForTransfer] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAllFiles, setLoadingAllFiles] = useState(false);
  const hasInitiallyLoadedRef = useRef(false);

  const orgId = org?.id ?? null;

  const fetchCloudFiles = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) {
      setDriveFolders([]);
      setRecentFiles([]);
      setLoading(false);
      return;
    }

    const isBackgroundRefetch = hasInitiallyLoadedRef.current;
    try {
      if (!isBackgroundRefetch) setLoading(true);
      const db = getFirebaseFirestore();
      const scoped = filterScopedLinkedDrives(linkedDrives, {
        isEnterpriseContext,
        orgId,
        creatorOnly,
        teamRouteOwnerUid,
      });
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
        const token = await user.getIdToken(true);
        const driveIdsParam = scoped.map((d) => d.id).join(",");

        const [countRes, recentRes] = await Promise.all([
          fetch(
            `${base}/api/files/drive-item-counts?organization_id=${encodeURIComponent(orgId)}&drive_ids=${encodeURIComponent(driveIdsParam)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
          fetch(
            `${base}/api/files/filter?context=enterprise&organization_id=${encodeURIComponent(orgId)}&sort=newest&page_size=50`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
        ]);

        const countData = countRes.ok
          ? ((await countRes.json()) as { counts?: Record<string, number> })
          : { counts: {} };
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

        const recentData = recentRes.ok
          ? ((await recentRes.json()) as { files?: Record<string, unknown>[] })
          : { files: [] };
        const recent: RecentFile[] = (recentData.files ?? [])
          .map((raw) => apiFileToRecentFile(raw, driveNameById))
          .filter((r) => driveIds.has(r.driveId))
          .slice(0, 24);
        setRecentFiles(recent);
      } else if (teamRouteOwnerUid && scoped.length > 0) {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const token = await user.getIdToken(true);
        const driveIdsParam = scoped.map((d) => d.id).join(",");
        const ownerParam = encodeURIComponent(teamRouteOwnerUid);

        const [countRes, recentRes] = await Promise.all([
          fetch(
            `${base}/api/files/drive-item-counts?team_owner_id=${ownerParam}&drive_ids=${encodeURIComponent(driveIdsParam)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
          fetch(
            `${base}/api/files/filter?team_owner_id=${ownerParam}&sort=newest&page_size=50`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
        ]);

        const countData = countRes.ok
          ? ((await countRes.json()) as { counts?: Record<string, number> })
          : { counts: {} };
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

        const recentData = recentRes.ok
          ? ((await recentRes.json()) as { files?: Record<string, unknown>[] })
          : { files: [] };
        const recent: RecentFile[] = (recentData.files ?? [])
          .map((raw) => apiFileToRecentFile(raw, driveNameById))
          .filter((r) => driveIds.has(r.driveId))
          .slice(0, 24);
        setRecentFiles(recent);
      } else {
        const [folders, recentList] = await Promise.all([
          Promise.all(
            scoped.map(async (drive) => {
              const countSnap = await getCountFromServer(
                personalDriveFilesCountQuery(db, drive)
              );
              return {
                id: drive.id,
                name: drive.name,
                type: "folder" as const,
                key: `drive-${drive.id}`,
                items: countSnap.data().count,
                lastSyncedAt: drive.last_synced_at,
                isCreatorRaw: drive.is_creator_raw === true,
              };
            })
          ),
          (async (): Promise<RecentFile[]> => {
            const { files: list } = await fetchFilesFromFilterApi(user, { pageSize: 50 });
            return list.filter((r) => driveIds.has(r.driveId)).slice(0, 24);
          })(),
        ]);
        setDriveFolders(folders);
        setRecentFiles(recentList);
      }
    } catch (err) {
      console.error("useCloudFiles:", err);
      setDriveFolders([]);
      setRecentFiles([]);
    } finally {
      hasInitiallyLoadedRef.current = true;
      setLoading(false);
    }
  }, [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives, teamRouteOwnerUid]);

  useEffect(() => {
    fetchCloudFiles();
  }, [fetchCloudFiles, storageVersion]);

  /** Fetches all user files for the transfer modal (up to 500). Call when modal opens. */
  const fetchAllFilesForTransfer = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) {
      setAllFilesForTransfer([]);
      return;
    }
    try {
      setLoadingAllFiles(true);
      const db = getFirebaseFirestore();
      const scoped = filterScopedLinkedDrives(linkedDrives, {
        isEnterpriseContext,
        orgId,
        creatorOnly,
        teamRouteOwnerUid,
      });
      const driveMap = new Map(scoped.map((d) => [d.id, d]));
      const driveIds = new Set(scoped.map((d) => d.id));
      const driveNameById = new Map(scoped.map((d) => [d.id, d.name]));

      if (isEnterpriseContext && orgId) {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const token = await user.getIdToken(true);
        const collected: RecentFile[] = [];
        let cursor: string | null = null;
        while (collected.length < 500) {
          const params = new URLSearchParams({
            context: "enterprise",
            organization_id: orgId,
            sort: "newest",
            page_size: "50",
          });
          if (cursor) params.set("cursor", cursor);
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
            if (collected.length >= 500) break;
          }
          if (!data.hasMore || !data.cursor) break;
          cursor = data.cursor;
        }
        setAllFilesForTransfer(collected.slice(0, 500));
        return;
      }

      const perDriveLimit = Math.max(
        40,
        Math.ceil(500 / Math.max(1, scoped.length))
      );
      const collected: RecentFile[] = [];
      for (const drive of scoped) {
        if (collected.length >= 500) break;
        if (drive.organization_id) {
          const q = query(
            collection(db, "backup_files"),
            where("linked_drive_id", "==", drive.id),
            where("organization_id", "==", drive.organization_id),
            where("deleted_at", "==", null),
            orderBy("modified_at", "desc"),
            limit(perDriveLimit)
          );
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            if (d.data().deleted_at || !driveIds.has(d.data().linked_drive_id)) continue;
            const data = d.data();
            const path = data.relative_path ?? "";
            const name = (path.split("/").filter(Boolean).pop()) ?? path ?? "?";
            collected.push({
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
              galleryId: data.gallery_id ?? null,
              proxyStatus: (data.proxy_status as ProxyStatus | undefined) ?? null,
            });
            if (collected.length >= 500) break;
          }
        } else {
          const { files: part } = await fetchFilesFromFilterApi(user, {
            driveId: drive.id,
            teamOwnerUserId: teamRouteOwnerUid,
            pageSize: perDriveLimit,
          });
          for (const f of part) {
            if (!driveIds.has(f.driveId)) continue;
            collected.push({
              ...f,
              driveName: drive.name ?? f.driveName,
            });
            if (collected.length >= 500) break;
          }
        }
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
      setAllFilesForTransfer(collected.slice(0, 500));
    } catch (err) {
      console.error("fetchAllFilesForTransfer:", err);
      setAllFilesForTransfer([]);
    } finally {
      setLoadingAllFiles(false);
    }
  }, [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives, teamRouteOwnerUid]);

  const fetchDriveFiles = useCallback(
    async (driveId: string): Promise<RecentFile[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const driveMeta = new Map(linkedDrives.map((d) => [d.id, d]));
      const drive = driveMeta.get(driveId);
      const driveNameById = new Map(linkedDrives.map((d) => [d.id, d.name]));

      if (drive?.organization_id) {
        const token = await user.getIdToken(true);
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const params = new URLSearchParams({
          context: "enterprise",
          organization_id: drive.organization_id,
          drive_id: driveId,
          sort: "newest",
          page_size: "50",
        });
        const res = await fetch(`${base}/api/files/filter?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { files?: Record<string, unknown>[] };
        return (data.files ?? []).map((raw) =>
          apiFileToRecentFile(raw, driveNameById)
        );
      }

      const { files } = await fetchFilesFromFilterApi(user, {
        driveId,
        teamOwnerUserId: teamRouteOwnerUid,
        pageSize: 50,
      });
      return files.map((f) => ({
        ...f,
        driveName: drive?.name ?? f.driveName,
      }));
    },
    [user, linkedDrives, teamRouteOwnerUid]
  );

  /** Fetches files uploaded to Storage in the past 72 hours. Reference view—files live in Storage, not duplicated. */
  const fetchRecentUploads = useCallback(async (): Promise<RecentFile[]> => {
    if (!isFirebaseConfigured() || !user) return [];
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const storageDriveIds = linkedDrives
      .filter((d) => {
        const n = d.name.replace(/^\[Team\]\s+/, "");
        return n === "Storage" || n === "Uploads";
      })
      .map((d) => d.id);
    if (storageDriveIds.length === 0) return [];
    const driveMap = new Map(linkedDrives.map((d) => [d.id, d]));
    const maxPagesPerDrive = 12;
    const perDrive = await Promise.all(
      storageDriveIds.map(async (driveId) => {
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
              });
            } else {
              pageResult = await fetchFilesFromFilterApi(user, {
                driveId,
                teamOwnerUserId: teamRouteOwnerUid,
                pageSize: 50,
                cursor,
              });
            }
            const { files: rows, nextCursor, hasMore } = pageResult;
            for (const row of rows) {
              const dateStr = recentUploadRecencyIso(row);
              if (!dateStr || dateStr < seventyTwoHoursAgo) continue;
              batch.push({
                ...row,
                driveName: drive?.name ?? row.driveName ?? "Storage",
              });
            }
            const lastRow = rows[rows.length - 1];
            const lastRec = lastRow ? recentUploadRecencyIso(lastRow) : null;
            if (!hasMore || !nextCursor || rows.length === 0) break;
            // Newest-first: once the oldest item in this page is outside the window, older pages won't qualify.
            if (!lastRec || lastRec < seventyTwoHoursAgo) break;
            cursor = nextCursor;
          }
        } catch {
          // skip this drive
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
    const dedup = new Map<string, RecentFile>();
    for (const f of all) dedup.set(f.id, f);
    const result = [...dedup.values()].slice(0, 24);
    setRecentUploads(result);
    return result;
  }, [user, linkedDrives, teamRouteOwnerUid]);

  /** Subscribes to backup_files for a drive. Returns unsubscribe. Use for real-time updates (e.g. mount uploads). */
  const subscribeToDriveFiles = useCallback(
    (driveId: string, onFiles: (files: RecentFile[]) => void): (() => void) => {
      if (!isFirebaseConfigured() || !user) return () => {};
      const db = getFirebaseFirestore();
      const drive = linkedDrives.find((d) => d.id === driveId);
      if (drive?.organization_id) {
        const q = query(
          collection(db, "backup_files"),
          where("linked_drive_id", "==", driveId),
          where("organization_id", "==", drive.organization_id),
          where("deleted_at", "==", null),
          orderBy("modified_at", "desc")
        );
        return onSnapshot(q, (snap) => {
          const files: RecentFile[] = snap.docs
            .filter((d) => !d.data().deleted_at)
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
              };
            });
          onFiles(files);
        });
      }

      let cancelled = false;
      const refresh = async () => {
        if (cancelled) return;
        const { files } = await fetchFilesFromFilterApi(user, {
          driveId,
          teamOwnerUserId: teamRouteOwnerUid,
          pageSize: 80,
        });
        onFiles(
          files.map((f) => ({
            ...f,
            driveName: drive?.name ?? f.driveName,
          }))
        );
      };
      void refresh();
      const tid =
        typeof window !== "undefined" ? window.setInterval(() => void refresh(), 5000) : null;
      return () => {
        cancelled = true;
        if (tid != null) window.clearInterval(tid);
      };
    },
    [user, linkedDrives, teamRouteOwnerUid]
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
          if (data.deleted_at) return;
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
      const perDriveSnaps = await Promise.all(
        scoped.map((drive) =>
          getDocs(
            drive.organization_id
              ? query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", drive.id),
                  where("organization_id", "==", drive.organization_id),
                  where("deleted_at", "!=", null),
                  orderBy("deleted_at", "desc"),
                  limit(120)
                )
              : query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", drive.id),
                  where("deleted_at", "!=", null),
                  orderBy("deleted_at", "desc"),
                  limit(120)
                )
          )
        )
      );
      const trashedDocs = perDriveSnaps.flatMap((s) => s.docs);
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
        };
        });
    },
    [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives, teamRouteOwnerUid]
  );

  const recalculateStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) return;
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
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

  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      try {
        await trashBackupFileIdsViaApi([fileId]);
      } catch (e) {
        console.error(e);
        return;
      }
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, recalculateStorage]
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
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, recalculateStorage]
  );

  const restoreFile = useCallback(
    async (fileId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      await updateDoc(doc(db, "backup_files", fileId), {
        deleted_at: null,
      });
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, recalculateStorage]
  );

  const permanentlyDeleteFile = useCallback(
    async (fileId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
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
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, recalculateStorage]
  );

  const renameFile = useCallback(
    async (fileId: string, newName: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const fileRef = doc(db, "backup_files", fileId);
      const fileSnap = await getDoc(fileRef);
      if (!fileSnap.exists()) return;
      const data = fileSnap.data();
      if (data?.userId !== user.uid) return;
      const path = (data.relative_path as string) ?? "";
      const parts = path.split("/").filter(Boolean);
      parts[parts.length - 1] = newName.trim();
      const newPath = parts.join("/");
      await updateDoc(fileRef, { relative_path: newPath });
      bumpStorageVersion();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, bumpStorageVersion]
  );

  const renameFolder = useCallback(
    async (driveId: string, newName: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const driveRef = doc(db, "linked_drives", driveId);
      await updateDoc(driveRef, { name: newName.trim() || "Folder" });
      await fetchDrives();
      bumpStorageVersion();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, bumpStorageVersion, fetchDrives]
  );

  const moveFile = useCallback(
    async (fileId: string, targetDriveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const fileSnap = await getDoc(doc(db, "backup_files", fileId));
      if (!fileSnap.exists()) return;
      const data = fileSnap.data();
      if (data?.userId !== user.uid) return;
      const path = (data.relative_path as string) ?? "";
      const fileName = (path.split("/").filter(Boolean).pop() ?? path) || "file";
      await updateDoc(doc(db, "backup_files", fileId), {
        linked_drive_id: targetDriveId,
        relative_path: fileName,
      });
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, recalculateStorage]
  );

  const moveFilesToFolder = useCallback(
    async (fileIds: string[], targetDriveId: string) => {
      if (!isFirebaseConfigured() || !user || fileIds.length === 0) return;
      const db = getFirebaseFirestore();
      for (const fileId of fileIds) {
        const fileSnap = await getDoc(doc(db, "backup_files", fileId));
        if (!fileSnap.exists() || fileSnap.data()?.userId !== user.uid) continue;
        const data = fileSnap.data()!;
        const path = (data.relative_path as string) ?? "";
        const fileName = (path.split("/").filter(Boolean).pop() ?? path) || "file";
        await updateDoc(doc(db, "backup_files", fileId), {
          linked_drive_id: targetDriveId,
          relative_path: fileName,
        });
      }
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, recalculateStorage]
  );

  const getFileIdsForBulkShare = useCallback(
    async (fileIds: string[], folderDriveIds: string[]): Promise<string[]> => {
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
                  where("deleted_at", "==", null)
                )
              : query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", driveId),
                  where("deleted_at", "==", null)
                )
            : query(
                collection(db, "backup_files"),
                where("userId", "==", user.uid),
                where("linked_drive_id", "==", driveId),
                where("deleted_at", "==", null)
              )
        );
        snap.docs.forEach((d) => ids.add(d.id));
      }
      return Array.from(ids);
    },
    [user, linkedDrives]
  );

  const moveFolderContentsToFolder = useCallback(
    async (sourceDriveId: string, targetDriveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const sourceDrive = linkedDrives.find((d) => d.id === sourceDriveId);
      const filesSnap = await getDocs(
        shouldQueryDriveWideFiles(sourceDrive, user.uid)
          ? sourceDrive?.organization_id
            ? query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", sourceDriveId),
                where("organization_id", "==", sourceDrive.organization_id),
                where("deleted_at", "==", null)
              )
            : query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", sourceDriveId),
                where("deleted_at", "==", null)
              )
          : query(
              collection(db, "backup_files"),
              where("userId", "==", user.uid),
              where("linked_drive_id", "==", sourceDriveId),
              where("deleted_at", "==", null)
            )
      );
      for (const d of filesSnap.docs) {
        const data = d.data();
        const path = (data.relative_path as string) ?? "";
        const fileName = (path.split("/").filter(Boolean).pop() ?? path) || "file";
        await updateDoc(doc(db, "backup_files", d.id), {
          linked_drive_id: targetDriveId,
          relative_path: fileName,
        });
      }
      if (sourceDrive) await unlinkDrive(sourceDrive);
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, linkedDrives, unlinkDrive, fetchCloudFiles, recalculateStorage]
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
                  where("deleted_at", "==", null)
                )
              : query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", drive.id),
                  where("deleted_at", "==", null)
                )
            : query(
                collection(db, "backup_files"),
                where("userId", "==", user.uid),
                where("linked_drive_id", "==", drive.id),
                where("deleted_at", "==", null)
              )
        );
        const ids = filesSnap.docs.map((d) => d.id);
        try {
          await trashBackupFileIdsViaApi(ids);
        } catch (e) {
          console.error(e);
          return;
        }
        await updateDoc(doc(db, "linked_drives", drive.id), {
          deleted_at: serverTimestamp(),
        });
        await recalculateStorage();
        await fetchDrives();
      }
      bumpStorageVersion();
      await fetchCloudFiles();
    },
    [user, linkedDrives, unlinkDrive, fetchDrives, fetchCloudFiles, recalculateStorage, bumpStorageVersion]
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
    if (isEnterpriseContext && orgId && drivesInContext.length > 0) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const token = await user.getIdToken(true);
      const driveIdsParam = drivesInContext.map((d) => d.id).join(",");
      const countRes = await fetch(
        `${base}/api/files/drive-item-counts?organization_id=${encodeURIComponent(orgId)}&drive_ids=${encodeURIComponent(driveIdsParam)}&deleted=only`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (countRes.ok) {
        const countData = (await countRes.json()) as { counts?: Record<string, number> };
        countMap = countData.counts ?? {};
      }
    }

    const result: DeletedDrive[] = [];
    for (const d of drivesInContext) {
      const data = d.data();
      const oid = data.organization_id ?? null;
      let items: number;
      if (isEnterpriseContext && orgId) {
        items = countMap[d.id] ?? 0;
      } else {
        const countSnap = await getCountFromServer(
          oid
            ? query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", d.id),
                where("organization_id", "==", oid),
                where("deleted_at", "!=", null)
              )
            : query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", d.id),
                where("deleted_at", "!=", null)
              )
        );
        items = countSnap.data().count;
      }
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
      const filesSnap = await getDocs(
        sourceDrive?.organization_id
          ? query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", driveId),
              where("organization_id", "==", sourceDrive.organization_id),
              where("deleted_at", "!=", null)
            )
          : query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", driveId),
              where("deleted_at", "!=", null)
            )
      );
      const BATCH_SIZE = 500;
      for (let i = 0; i < filesSnap.docs.length; i += BATCH_SIZE) {
        const chunk = filesSnap.docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const d of chunk) {
          batch.update(doc(db, "backup_files", d.id), { deleted_at: null });
        }
        await batch.commit();
      }
      await updateDoc(doc(db, "linked_drives", driveId), { deleted_at: null });
      await recalculateStorage();
      await fetchDrives();
      bumpStorageVersion();
      await fetchCloudFiles();
    },
    [user, linkedDrives, fetchDrives, fetchCloudFiles, recalculateStorage, bumpStorageVersion]
  );

  const permanentlyDeleteDrive = useCallback(
    async (driveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
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
      await recalculateStorage();
      await fetchDrives();
      bumpStorageVersion();
      await fetchCloudFiles();
    },
    [user, fetchDrives, fetchCloudFiles, recalculateStorage, bumpStorageVersion]
  );

  return {
    driveFolders,
    recentFiles,
    recentUploads,
    fetchRecentUploads,
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
    moveFolderContentsToFolder,
    getFileIdsForBulkShare,
  };
}
