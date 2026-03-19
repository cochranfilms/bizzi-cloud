"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  documentId,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import type { RecentFile } from "@/hooks/useCloudFiles";

const PINNED_COLLECTION = "pinned_items";
const DOC_ID_IN_QUERY_LIMIT = 10;
const FETCH_PINNED_FILES_LIMIT = 30;

/** Fetches RecentFile[] from backup_files by document IDs (max 30, batched for Firestore 'in' limit of 10). */
export async function fetchPinnedFiles(ids: string[]): Promise<RecentFile[]> {
  if (!isFirebaseConfigured() || ids.length === 0) return [];
  const db = getFirebaseFirestore();
  const limited = ids.slice(0, FETCH_PINNED_FILES_LIMIT);
  const driveMap = new Map<string, string>();
  const allFiles: RecentFile[] = [];

  // Query by documentId only (no userId filter) - matches fetchFilesByIds in useCloudFiles.
  // Pinned IDs come from user's pinned_items, so we only fetch their own files.
  // A userId+documentId composite index may not exist; documentId-only works without one.
  for (let i = 0; i < limited.length; i += DOC_ID_IN_QUERY_LIMIT) {
    const chunk = limited.slice(i, i + DOC_ID_IN_QUERY_LIMIT);
    const filesSnap = await getDocs(
      query(
        collection(db, "backup_files"),
        where(documentId(), "in", chunk)
      )
    );
    const driveIds = [...new Set(filesSnap.docs.map((d) => d.data().linked_drive_id as string).filter(Boolean))];
    for (let j = 0; j < driveIds.length && driveMap.size < driveIds.length; j += DOC_ID_IN_QUERY_LIMIT) {
      const driveChunk = driveIds.slice(j, j + DOC_ID_IN_QUERY_LIMIT);
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
        driveName: driveMap.get(data.linked_drive_id) ?? "Unknown",
        contentType: data.content_type ?? null,
        galleryId: data.gallery_id ?? null,
      });
    });
  }
  return allFiles;
}

export function usePinned() {
  const { user } = useAuth();
  const [pinnedFolderIds, setPinnedFolderIds] = useState<Set<string>>(new Set());
  const [pinnedFileIds, setPinnedFileIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured() || !user) {
      setPinnedFolderIds(new Set());
      setPinnedFileIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const db = getFirebaseFirestore();
    const q = query(
      collection(db, PINNED_COLLECTION),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const folders = new Set<string>();
        const files = new Set<string>();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.itemType === "folder") folders.add(data.itemId);
          if (data.itemType === "file") files.add(data.itemId);
        });
        setPinnedFolderIds(folders);
        setPinnedFileIds(files);
        setLoading(false);
      },
      (err) => {
        console.error("usePinned onSnapshot:", err);
        setPinnedFolderIds(new Set());
        setPinnedFileIds(new Set());
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  const pinItem = useCallback(
    async (itemType: "file" | "folder", itemId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const existing = await getDocs(
        query(
          collection(db, PINNED_COLLECTION),
          where("userId", "==", user.uid),
          where("itemType", "==", itemType),
          where("itemId", "==", itemId)
        )
      );
      if (!existing.empty) return;
      await addDoc(collection(db, PINNED_COLLECTION), {
        userId: user.uid,
        itemType,
        itemId,
        createdAt: serverTimestamp(),
      });
    },
    [user]
  );

  const unpinItem = useCallback(
    async (itemType: "file" | "folder", itemId: string) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      const snap = await getDocs(
        query(
          collection(db, PINNED_COLLECTION),
          where("userId", "==", user.uid),
          where("itemType", "==", itemType),
          where("itemId", "==", itemId)
        )
      );
      for (const d of snap.docs) {
        await deleteDoc(doc(db, PINNED_COLLECTION, d.id));
      }
    },
    [user]
  );

  const isPinned = useCallback(
    (itemType: "file" | "folder", itemId: string) => {
      if (itemType === "file") return pinnedFileIds.has(itemId);
      return pinnedFolderIds.has(itemId);
    },
    [pinnedFileIds, pinnedFolderIds]
  );

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const db = getFirebaseFirestore();
    const snap = await getDocs(
      query(
        collection(db, PINNED_COLLECTION),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      )
    );
    const folders = new Set<string>();
    const files = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.itemType === "folder") folders.add(data.itemId);
      if (data.itemType === "file") files.add(data.itemId);
    });
    setPinnedFolderIds(folders);
    setPinnedFileIds(files);
    setLoading(false);
  }, [user]);

  return {
    pinnedFolderIds,
    pinnedFileIds,
    loading,
    pinItem,
    unpinItem,
    isPinned,
    refetch,
    fetchPinnedFiles,
  };
}
