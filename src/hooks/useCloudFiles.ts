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
} from "firebase/firestore";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
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
}

export function useCloudFiles() {
  const { user } = useAuth();
  const { linkedDrives, storageVersion } = useBackup();
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
          limit(24)
        )
      );
      const recent: RecentFile[] = filesSnap.docs.map((d) => {
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
      return filesSnap.docs.map((d) => {
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

  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      await deleteDoc(doc(db, "backup_files", fileId));
      await fetchCloudFiles();
    },
    [user, fetchCloudFiles]
  );

  return { driveFolders, recentFiles, loading, refetch: fetchCloudFiles, fetchDriveFiles, deleteFile };
}
