"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  documentId,
  getDoc,
  deleteDoc,
  getDocs,
  getCountFromServer,
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
import { usePathname } from "next/navigation";

export interface DriveFolder {
  id: string;
  name: string;
  type: "folder";
  key: string;
  items: number;
  lastSyncedAt: string | null;
}

export interface DeletedDrive {
  id: string;
  name: string;
  items: number;
  deletedAt: string | null;
}

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
  /** When set, file is in trash */
  deletedAt?: string | null;
}

/** True when pathname is under /enterprise (enterprise storage context). */
function useIsEnterpriseContext(): boolean {
  const pathname = usePathname();
  return typeof pathname === "string" && pathname.startsWith("/enterprise");
}

export function useCloudFiles() {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const isEnterpriseContext = useIsEnterpriseContext();
  const { linkedDrives, storageVersion, bumpStorageVersion, unlinkDrive, fetchDrives } = useBackup();
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = org?.id ?? null;

  const fetchCloudFiles = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) {
      setDriveFolders([]);
      setRecentFiles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const db = getFirebaseFirestore();
      // Fetch linked drives from Firestore so refetch() after delete uses fresh data
      // (React state may not have propagated yet when refetch runs)
      const drivesSnap = await getDocs(
        query(
          collection(db, "linked_drives"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        )
      );
      const drives = drivesSnap.docs
        .filter((d) => {
          const data = d.data();
          if (data.deleted_at) return false;
          const oid = data.organization_id ?? null;
          if (isEnterpriseContext && orgId) return oid === orgId;
          return !oid;
        })
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "Folder",
            last_synced_at: data.last_synced_at ?? null,
          };
        });
      const driveMap = new Map(drives.map((d) => [d.id, d]));

      const folders: DriveFolder[] = [];
      for (const drive of drives) {
        const countSnap = await getCountFromServer(
          query(
            collection(db, "backup_files"),
            where("userId", "==", user.uid),
            where("linked_drive_id", "==", drive.id),
            where("deleted_at", "==", null)
          )
        );
        const filesCount = countSnap.data().count;
        folders.push({
          id: drive.id,
          name: drive.name,
          type: "folder",
          key: `drive-${drive.id}`,
          items: filesCount,
          lastSyncedAt: drive.last_synced_at,
        });
      }
      setDriveFolders(folders);

      const driveIds = new Set(drives.map((d) => d.id));
      const filesSnap = await getDocs(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
          orderBy("modified_at", "desc"),
          limit(50)
        )
      );
      const recent: RecentFile[] = filesSnap.docs
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
        };
      });
      setRecentFiles(recent);
    } catch (err) {
      console.error("useCloudFiles:", err);
      setDriveFolders([]);
      setRecentFiles([]);
    } finally {
      setLoading(false);
    }
  }, [user, isEnterpriseContext, org]);

  useEffect(() => {
    fetchCloudFiles();
  }, [fetchCloudFiles, storageVersion]);

  const fetchDriveFiles = useCallback(
    async (driveId: string): Promise<RecentFile[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const driveMap = new Map(linkedDrives.map((d) => [d.id, d]));
      const drive = driveMap.get(driveId);
      const filesSnap = await getDocs(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
          where("linked_drive_id", "==", driveId),
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
          };
        });
    },
    [user, linkedDrives]
  );

  /** Fetches RecentFile[] from backup_files by document IDs (max 30, batched for Firestore 'in' limit of 10). */
  const fetchFilesByIds = useCallback(
    async (ids: string[]): Promise<RecentFile[]> => {
      if (!isFirebaseConfigured() || !user || ids.length === 0) return [];
      const db = getFirebaseFirestore();
      const limited = ids.slice(0, 30);
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
      const drivesSnap = await getDocs(
        query(
          collection(db, "linked_drives"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        )
      );
      const drivesInContext = drivesSnap.docs.filter((d) => {
        const data = d.data();
        const oid = data.organization_id ?? null;
        if (isEnterpriseContext && orgId) return oid === orgId;
        return !oid;
      });
      const driveMap = new Map(
        drivesInContext.map((d) => {
          const data = d.data();
          return [d.id, { id: d.id, name: data.name ?? "Folder" }];
        })
      );
      const driveIds = new Set(driveMap.keys());
      const filesSnap = await getDocs(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
          where("deleted_at", "!=", null),
          orderBy("deleted_at", "desc")
        )
      );
      return filesSnap.docs
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
          deletedAt: deletedAt ?? undefined,
        };
      });
    },
    [user, isEnterpriseContext, orgId]
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
      const db = getFirebaseFirestore();
      await updateDoc(doc(db, "backup_files", fileId), {
        deleted_at: serverTimestamp(),
      });
      await recalculateStorage();
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles, recalculateStorage]
  );

  const deleteFiles = useCallback(
    async (fileIds: string[]) => {
      if (!isFirebaseConfigured() || !user || fileIds.length === 0) return;
      const db = getFirebaseFirestore();
      const BATCH_SIZE = 500;
      for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
        const chunk = fileIds.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const id of chunk) {
          batch.update(doc(db, "backup_files", id), {
            deleted_at: serverTimestamp(),
          });
        }
        await batch.commit();
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
      const db = getFirebaseFirestore();
      const fileRef = doc(db, "backup_files", fileId);
      await deleteDoc(fileRef);
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
        const snap = await getDocs(
          query(
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
    [user]
  );

  const moveFolderContentsToFolder = useCallback(
    async (sourceDriveId: string, targetDriveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const filesSnap = await getDocs(
        query(
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
      const sourceDrive = linkedDrives.find((d) => d.id === sourceDriveId);
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
        const filesSnap = await getDocs(
          query(
            collection(db, "backup_files"),
            where("userId", "==", user.uid),
            where("linked_drive_id", "==", drive.id),
            where("deleted_at", "==", null)
          )
        );
        const BATCH_SIZE = 500;
        for (let i = 0; i < filesSnap.docs.length; i += BATCH_SIZE) {
          const chunk = filesSnap.docs.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          for (const d of chunk) {
            batch.update(doc(db, "backup_files", d.id), {
              deleted_at: serverTimestamp(),
            });
          }
          await batch.commit();
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
      const countSnap = await getCountFromServer(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
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
      const filesSnap = await getDocs(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
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
    [user, fetchDrives, fetchCloudFiles, recalculateStorage, bumpStorageVersion]
  );

  const permanentlyDeleteDrive = useCallback(
    async (driveId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const filesSnap = await getDocs(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
          where("linked_drive_id", "==", driveId)
        )
      );
      for (const d of filesSnap.docs) {
        await deleteDoc(doc(db, "backup_files", d.id));
      }
      await deleteDoc(doc(db, "linked_drives", driveId));
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
    loading,
    refetch: fetchCloudFiles,
    fetchDriveFiles,
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
