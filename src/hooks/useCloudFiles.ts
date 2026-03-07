"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  deleteDoc,
  getDocs,
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

export interface DriveFolder {
  id: string;
  name: string;
  type: "folder";
  key: string;
  items: number;
  lastSyncedAt: string | null;
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
  /** When set, file is in trash */
  deletedAt?: string | null;
}

export function useCloudFiles() {
  const { user } = useAuth();
  const { linkedDrives, storageVersion, bumpStorageVersion } = useBackup();
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

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
      const driveMap = new Map(linkedDrives.map((d) => [d.id, d]));

      const folders: DriveFolder[] = [];
      for (const drive of linkedDrives) {
        const snapSnap = await getDocs(
          query(
            collection(db, "backup_snapshots"),
            where("userId", "==", user.uid),
            where("linked_drive_id", "==", drive.id),
            where("status", "==", "completed"),
            orderBy("completed_at", "desc"),
            limit(1)
          )
        );
        const filesCount = snapSnap.empty ? 0 : snapSnap.docs[0].data().files_count ?? 0;
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

      const filesSnap = await getDocs(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
          orderBy("modified_at", "desc"),
          limit(50)
        )
      );
      const recent: RecentFile[] = filesSnap.docs
        .filter((d) => !d.data().deleted_at)
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
  }, [user, linkedDrives]);

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
          };
        });
    },
    [user, linkedDrives]
  );

  const fetchDeletedFiles = useCallback(
    async (): Promise<RecentFile[]> => {
      if (!isFirebaseConfigured() || !user) return [];
      const db = getFirebaseFirestore();
      const driveMap = new Map(linkedDrives.map((d) => [d.id, d]));
      const filesSnap = await getDocs(
        query(
          collection(db, "backup_files"),
          where("userId", "==", user.uid),
          where("deleted_at", "!=", null),
          orderBy("deleted_at", "desc")
        )
      );
      return filesSnap.docs.map((d) => {
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
          deletedAt: deletedAt ?? undefined,
        };
      });
    },
    [user, linkedDrives]
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

  return {
    driveFolders,
    recentFiles,
    loading,
    refetch: fetchCloudFiles,
    fetchDriveFiles,
    fetchDeletedFiles,
    deleteFile,
    deleteFiles,
    restoreFile,
    permanentlyDeleteFile,
  };
}
