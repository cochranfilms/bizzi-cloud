"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
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
  writeBatch,
} from "firebase/firestore";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getDashboardWorkspaceKey } from "@/lib/dashboard-workspace-appearance-storage";
import type { RecentFile } from "@/hooks/useCloudFiles";

const PINNED_COLLECTION = "pinned_items";
const LEGACY_PIN_WORKSPACE_MIGRATION_KEY = "bizzi-pinned-workspace-key-v1";

async function ensureLegacyPinsHaveWorkspaceKey(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(LEGACY_PIN_WORKSPACE_MIGRATION_KEY) === "1") return;
  } catch {
    /* ignore */
  }
  const db = getFirebaseFirestore();
  const snap = await getDocs(
    query(collection(db, PINNED_COLLECTION), where("userId", "==", userId))
  );
  const needsUpdate = snap.docs.filter((d) => {
    const w = d.data().workspaceKey;
    return typeof w !== "string" || w.length === 0;
  });
  const BATCH = 450;
  for (let i = 0; i < needsUpdate.length; i += BATCH) {
    const chunk = needsUpdate.slice(i, i + BATCH);
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.update(d.ref, { workspaceKey: "personal" });
    }
    await batch.commit();
  }
  try {
    localStorage.setItem(LEGACY_PIN_WORKSPACE_MIGRATION_KEY, "1");
  } catch {
    /* ignore */
  }
}
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
        driveName: driveMap.get(data.linked_drive_id) ?? "Unknown",
        contentType: data.content_type ?? null,
        assetType: data.asset_type ?? null,
        galleryId: data.gallery_id ?? null,
      });
    });
  }
  return allFiles;
}

export function usePinned() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { org } = useEnterprise();
  const workspaceKey = useMemo(
    () => getDashboardWorkspaceKey(pathname, org?.id ?? null),
    [pathname, org?.id],
  );
  const pinsScopeReady =
    !pathname?.startsWith("/enterprise") || workspaceKey !== "enterprise:pending";
  const [pinnedFolderIds, setPinnedFolderIds] = useState<Set<string>>(new Set());
  const [pinnedFolderLabels, setPinnedFolderLabels] = useState<Map<string, string>>(() => new Map());
  const [pinnedFileIds, setPinnedFileIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured() || !user || !pinsScopeReady) {
      setPinnedFolderIds(new Set());
      setPinnedFolderLabels(new Map());
      setPinnedFileIds(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;
    setLoading(true);
    void (async () => {
      try {
        await ensureLegacyPinsHaveWorkspaceKey(user.uid);
      } catch (e) {
        console.error("ensureLegacyPinsHaveWorkspaceKey:", e);
      }
      if (cancelled) return;
      const db = getFirebaseFirestore();
      const q = query(
        collection(db, PINNED_COLLECTION),
        where("userId", "==", user.uid),
        where("workspaceKey", "==", workspaceKey),
        orderBy("createdAt", "desc"),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          const folders = new Set<string>();
          const folderLabels = new Map<string, string>();
          const files = new Set<string>();
          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.itemType === "folder") {
              const id = data.itemId as string;
              folders.add(id);
              const dl = data.displayLabel;
              if (typeof dl === "string" && dl.trim()) folderLabels.set(id, dl.trim());
            }
            if (data.itemType === "file") files.add(data.itemId);
          });
          setPinnedFolderIds(folders);
          setPinnedFolderLabels(folderLabels);
          setPinnedFileIds(files);
          setLoading(false);
        },
        (err) => {
          console.error("usePinned onSnapshot:", err);
          setPinnedFolderIds(new Set());
          setPinnedFolderLabels(new Map());
          setPinnedFileIds(new Set());
          setLoading(false);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, workspaceKey, pinsScopeReady]);

  const pinItem = useCallback(
    async (
      itemType: "file" | "folder",
      itemId: string,
      opts?: { displayLabel?: string | null }
    ) => {
      if (!isFirebaseConfigured() || !user || !pinsScopeReady) return;
      const db = getFirebaseFirestore();
      const existing = await getDocs(
        query(
          collection(db, PINNED_COLLECTION),
          where("userId", "==", user.uid),
          where("workspaceKey", "==", workspaceKey),
          where("itemType", "==", itemType),
          where("itemId", "==", itemId),
        ),
      );
      if (!existing.empty) return;
      const label =
        typeof opts?.displayLabel === "string" && opts.displayLabel.trim()
          ? opts.displayLabel.trim()
          : null;
      await addDoc(collection(db, PINNED_COLLECTION), {
        userId: user.uid,
        workspaceKey,
        itemType,
        itemId,
        ...(label ? { displayLabel: label } : {}),
        createdAt: serverTimestamp(),
      });
    },
    [user, workspaceKey, pinsScopeReady],
  );

  const unpinItem = useCallback(
    async (itemType: "file" | "folder", itemId: string) => {
      if (!isFirebaseConfigured() || !user || !pinsScopeReady) return;
      const db = getFirebaseFirestore();
      const snap = await getDocs(
        query(
          collection(db, PINNED_COLLECTION),
          where("userId", "==", user.uid),
          where("workspaceKey", "==", workspaceKey),
          where("itemType", "==", itemType),
          where("itemId", "==", itemId),
        ),
      );
      for (const d of snap.docs) {
        await deleteDoc(doc(db, PINNED_COLLECTION, d.id));
      }
    },
    [user, workspaceKey, pinsScopeReady],
  );

  const isPinned = useCallback(
    (itemType: "file" | "folder", itemId: string) => {
      if (itemType === "file") return pinnedFileIds.has(itemId);
      return pinnedFolderIds.has(itemId);
    },
    [pinnedFileIds, pinnedFolderIds]
  );

  const refetch = useCallback(async () => {
    if (!user || !pinsScopeReady) return;
    const db = getFirebaseFirestore();
    const snap = await getDocs(
      query(
        collection(db, PINNED_COLLECTION),
        where("userId", "==", user.uid),
        where("workspaceKey", "==", workspaceKey),
        orderBy("createdAt", "desc"),
      ),
    );
    const folders = new Set<string>();
    const folderLabels = new Map<string, string>();
    const files = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.itemType === "folder") {
        const id = data.itemId as string;
        folders.add(id);
        const dl = data.displayLabel;
        if (typeof dl === "string" && dl.trim()) folderLabels.set(id, dl.trim());
      }
      if (data.itemType === "file") files.add(data.itemId);
    });
    setPinnedFolderIds(folders);
    setPinnedFolderLabels(folderLabels);
    setPinnedFileIds(files);
  }, [user, workspaceKey, pinsScopeReady]);

  return {
    pinnedFolderIds,
    pinnedFolderLabels,
    pinnedFileIds,
    loading,
    pinItem,
    unpinItem,
    isPinned,
    refetch,
    fetchPinnedFiles,
  };
}
