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

function filterScopedLinkedDrives(
  drives: LinkedDrive[],
  opts: { isEnterpriseContext: boolean; orgId: string | null; creatorOnly: boolean }
): LinkedDrive[] {
  return drives
    .filter((d) => {
      const oid = d.organization_id ?? null;
      if (opts.isEnterpriseContext && opts.orgId) return oid === opts.orgId;
      return !oid;
    })
    .filter((d) => {
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
  /** Optional metadata from filter API / backup_files */
  resolution_w?: number | null;
  resolution_h?: number | null;
  duration_sec?: number | null;
  video_codec?: string | null;
  width?: number | null;
  height?: number | null;
}

/** True when pathname is under /enterprise (enterprise storage context). */
function useIsEnterpriseContext(): boolean {
  const pathname = usePathname();
  return typeof pathname === "string" && pathname.startsWith("/enterprise");
}

export interface UseCloudFilesOptions {
  /** When true, return only Creator section drives (incl. RAW). When false, exclude Creator drives. */
  creatorOnly?: boolean;
}

export function useCloudFiles(options?: UseCloudFilesOptions) {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const isEnterpriseContext = useIsEnterpriseContext();
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
      const [folders, recentDocs] = await Promise.all([
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
        (async () => {
          const perDrive = await Promise.all(
            scoped.map((drive) =>
              getDocs(
                drive.organization_id
                  ? query(
                      collection(db, "backup_files"),
                      where("linked_drive_id", "==", drive.id),
                      where("organization_id", "==", drive.organization_id),
                      where("deleted_at", "==", null),
                      orderBy("modified_at", "desc"),
                      limit(35)
                    )
                  : query(
                      collection(db, "backup_files"),
                      where("linked_drive_id", "==", drive.id),
                      where("deleted_at", "==", null),
                      orderBy("modified_at", "desc"),
                      limit(35)
                    )
              )
            )
          );
          const merged = perDrive.flatMap((s) => s.docs);
          merged.sort(
            (a, b) => backupModifiedMs(b.data()) - backupModifiedMs(a.data())
          );
          return merged.slice(0, 50);
        })(),
      ]);
      setDriveFolders(folders);

      const recent: RecentFile[] = recentDocs
        .filter((d) => {
          if (d.data().deleted_at) return false;
          return driveIds.has(d.data().linked_drive_id);
        })
        .slice(0, 24)
        .map((d) => {
          const data = d.data();
          const path = data.relative_path ?? "";
          const name = (path.split("/").filter(Boolean).pop()) ?? path ?? "?";
          const drive = driveMap.get(data.linked_drive_id);
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
            galleryId: data.gallery_id ?? null,
            proxyStatus: (data.proxy_status as ProxyStatus | undefined) ?? null,
          };
        });
      setRecentFiles(recent);
    } catch (err) {
      console.error("useCloudFiles:", err);
      setDriveFolders([]);
      setRecentFiles([]);
    } finally {
      hasInitiallyLoadedRef.current = true;
      setLoading(false);
    }
  }, [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives]);

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
      });
      const driveMap = new Map(scoped.map((d) => [d.id, d]));
      const driveIds = new Set(scoped.map((d) => d.id));

      let docList: QueryDocumentSnapshot<DocumentData>[] = [];
      const perDriveLimit = Math.max(
        40,
        Math.ceil(500 / Math.max(1, scoped.length))
      );
      const perDrive = await Promise.all(
        scoped.map((drive) => {
          const q = drive.organization_id
            ? query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", drive.id),
                where("organization_id", "==", drive.organization_id),
                where("deleted_at", "==", null),
                orderBy("modified_at", "desc"),
                limit(perDriveLimit)
              )
            : query(
                collection(db, "backup_files"),
                where("linked_drive_id", "==", drive.id),
                where("deleted_at", "==", null),
                orderBy("modified_at", "desc"),
                limit(perDriveLimit)
              );
          return getDocs(q);
        })
      );
      const merged = perDrive.flatMap((s) => s.docs);
      merged.sort(
        (a, b) => backupModifiedMs(b.data()) - backupModifiedMs(a.data())
      );
      docList = merged.slice(0, 500);

      const all: RecentFile[] = docList
        .filter((d) => {
          if (d.data().deleted_at) return false;
          return driveIds.has(d.data().linked_drive_id);
        })
        .map((d) => {
          const data = d.data();
          const path = data.relative_path ?? "";
          const name = (path.split("/").filter(Boolean).pop()) ?? path ?? "?";
          const drive = driveMap.get(data.linked_drive_id);
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
            galleryId: data.gallery_id ?? null,
            proxyStatus: (data.proxy_status as ProxyStatus | undefined) ?? null,
          };
        });
      setAllFilesForTransfer(all);
    } catch (err) {
      console.error("fetchAllFilesForTransfer:", err);
      setAllFilesForTransfer([]);
    } finally {
      setLoadingAllFiles(false);
    }
  }, [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives]);

  const fetchDriveFiles = useCallback(
    async (driveId: string): Promise<RecentFile[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const driveMap = new Map(linkedDrives.map((d) => [d.id, d]));
      const drive = driveMap.get(driveId);
      const filesSnap = await getDocs(
        drive?.organization_id
          ? query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", driveId),
              where("organization_id", "==", drive.organization_id),
              where("deleted_at", "==", null),
              orderBy("modified_at", "desc")
            )
          : query(
              collection(db, "backup_files"),
              where("linked_drive_id", "==", driveId),
              where("deleted_at", "==", null),
              orderBy("modified_at", "desc")
            )
      );
      return filesSnap.docs
        .filter((d) => !d.data().deleted_at)
        .map((d) => {
          const data = d.data();
          const path = data.relative_path ?? "";
          const name = (path.split("/").filter(Boolean).pop()) ?? path ?? "?";
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
            galleryId: data.gallery_id ?? null,
            proxyStatus: (data.proxy_status as ProxyStatus | undefined) ?? null,
          };
        });
    },
    [user, linkedDrives]
  );

  /** Fetches files uploaded to Storage in the past 72 hours. Reference view—files live in Storage, not duplicated. */
  const fetchRecentUploads = useCallback(async (): Promise<RecentFile[]> => {
    if (!isFirebaseConfigured() || !user) return [];
    const db = getFirebaseFirestore();
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const storageDriveIds = linkedDrives
      .filter((d) => {
        const n = d.name.replace(/^\[Team\]\s+/, "");
        return n === "Storage" || n === "Uploads";
      })
      .map((d) => d.id);
    if (storageDriveIds.length === 0) return [];
    const driveMap = new Map(linkedDrives.map((d) => [d.id, d]));
    const perDrive = await Promise.all(
      storageDriveIds.map(async (driveId) => {
        const drive = driveMap.get(driveId);
        const batch: RecentFile[] = [];
        try {
          const filesSnap = await getDocs(
            drive?.organization_id
              ? query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", driveId),
                  where("organization_id", "==", drive.organization_id),
                  where("deleted_at", "==", null),
                  orderBy("modified_at", "desc"),
                  limit(50)
                )
              : query(
                  collection(db, "backup_files"),
                  where("linked_drive_id", "==", driveId),
                  where("deleted_at", "==", null),
                  orderBy("modified_at", "desc"),
                  limit(50)
                )
          );
          for (const docSnap of filesSnap.docs) {
            const data = docSnap.data();
            const modifiedAt = data.modified_at ?? null;
            const createdAt = data.created_at ?? null;
            const raw = createdAt ?? modifiedAt;
            let dateStr: string | null = null;
            if (raw) {
              if (typeof raw === "string") dateStr = raw;
              else if (typeof (raw as { toDate?: () => Date }).toDate === "function")
                dateStr = (raw as { toDate: () => Date }).toDate().toISOString();
            }
            if (!dateStr || dateStr < seventyTwoHoursAgo) continue;
            const path = data.relative_path ?? "";
            const name = (path.split("/").filter(Boolean).pop()) ?? path ?? "?";
            batch.push({
              id: docSnap.id,
              name,
              path,
              objectKey: data.object_key ?? "",
              size: data.size_bytes ?? 0,
              modifiedAt: modifiedAt ?? null,
              driveId: data.linked_drive_id,
              driveName: drive?.name ?? "Storage",
              contentType: data.content_type ?? null,
              assetType: data.asset_type ?? null,
              galleryId: data.gallery_id ?? null,
              proxyStatus: (data.proxy_status as ProxyStatus | undefined) ?? null,
            });
          }
        } catch {
          // Index may not exist; skip this drive
        }
        return batch;
      })
    );
    const all = perDrive.flat();
    all.sort((a, b) => {
      const ta = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
      const tb = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
      return tb - ta;
    });
    const result = all.slice(0, 24);
    setRecentUploads(result);
    return result;
  }, [user, linkedDrives]);

  /** Subscribes to backup_files for a drive. Returns unsubscribe. Use for real-time updates (e.g. mount uploads). */
  const subscribeToDriveFiles = useCallback(
    (driveId: string, onFiles: (files: RecentFile[]) => void): (() => void) => {
      if (!isFirebaseConfigured() || !user) return () => {};
      const db = getFirebaseFirestore();
      const drive = linkedDrives.find((d) => d.id === driveId);
      const q = drive?.organization_id
        ? query(
            collection(db, "backup_files"),
            where("linked_drive_id", "==", driveId),
            where("organization_id", "==", drive.organization_id),
            where("deleted_at", "==", null),
            orderBy("modified_at", "desc")
          )
        : query(
            collection(db, "backup_files"),
            where("linked_drive_id", "==", driveId),
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
    },
    [user, linkedDrives]
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
    [user, isEnterpriseContext, orgId, creatorOnly, linkedDrives]
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
    const result: DeletedDrive[] = [];
    for (const d of drivesInContext) {
      const data = d.data();
      const oid = data.organization_id ?? null;
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
      const deletedAt = data.deleted_at?.toDate?.()
        ? data.deleted_at.toDate().toISOString()
        : typeof data.deleted_at === "string"
          ? data.deleted_at
          : null;
      result.push({
        id: d.id,
        name: data.name ?? "Folder",
        items: countSnap.data().count,
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
