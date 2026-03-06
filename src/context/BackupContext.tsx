"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import type { LinkedDrive } from "@/types/backup";
import { enumerateFiles } from "@/lib/sync-engine";
import {
  useFileSystemAccess,
  isFileSystemAccessSupported,
} from "@/hooks/useFileSystemAccess";
import type { SyncProgress } from "@/types/backup";
import {
  getFirebaseFirestore,
  getFirebaseAuth,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

interface BackupContextValue {
  linkedDrives: LinkedDrive[];
  loading: boolean;
  error: string | null;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
  storageVersion: number;
  fetchDrives: () => Promise<void>;
  linkDrive: (
    name: string,
    handle: FileSystemDirectoryHandle
  ) => Promise<LinkedDrive>;
  startSync: (drive: LinkedDrive) => Promise<void>;
  cancelSync: () => void;
  pickDirectory: () => Promise<FileSystemDirectoryHandle>;
  unlinkDrive: (drive: LinkedDrive) => Promise<void>;
  uploadSingleFile: (file: File) => Promise<void>;
  uploadFolder: () => Promise<void>;
  fsAccessSupported: boolean;
}

const BackupContext = createContext<BackupContextValue | null>(null);

export function BackupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [linkedDrives, setLinkedDrives] = useState<LinkedDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [storageVersion, setStorageVersion] = useState(0);

  const {
    supported: fsAccessSupported,
    pickDirectory: pickDir,
    requestPermission,
    saveHandleToStore,
    getStoredHandleByDrive,
    deleteStoredHandle,
  } = useFileSystemAccess();

  const fetchDrives = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) {
      setLinkedDrives([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const db = getFirebaseFirestore();
      const q = query(
        collection(db, "linked_drives"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const drives: LinkedDrive[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          user_id: data.userId,
          name: data.name,
          mount_path: data.mount_path ?? null,
          permission_handle_id: data.permission_handle_id ?? null,
          last_synced_at: data.last_synced_at ?? null,
          created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        };
      });
      setLinkedDrives(drives);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLinkedDrives([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDrives();
  }, [fetchDrives]);

  const linkDrive = useCallback(
    async (
      name: string,
      handle: FileSystemDirectoryHandle
    ): Promise<LinkedDrive> => {
      if (!user) throw new Error("Not authenticated");

      const permission = await requestPermission(handle);
      if (permission !== "granted") {
        throw new Error("Permission denied to read directory");
      }

      const db = getFirebaseFirestore();
      const docRef = await addDoc(collection(db, "linked_drives"), {
        userId: user.uid,
        name: name || handle.name,
        permission_handle_id: `${handle.name}-${Date.now()}`,
        createdAt: new Date(),
      });

      const drive: LinkedDrive = {
        id: docRef.id,
        user_id: user.uid,
        name: name || handle.name,
        mount_path: null,
        permission_handle_id: `${handle.name}-${Date.now()}`,
        last_synced_at: null,
        created_at: new Date().toISOString(),
      };

      await saveHandleToStore(drive.id, drive.id, drive.name, handle);
      setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);

      return drive;
    },
    [user, requestPermission, saveHandleToStore]
  );

  const startSync = useCallback(
    async (drive: LinkedDrive) => {
      if (!user) {
        setError("Please sign in to sync.");
        return;
      }
      if (!isFileSystemAccessSupported()) {
        setError("File System Access API is not supported. Use Chrome or Edge.");
        return;
      }
      if (!isFirebaseConfigured()) {
        setError("Firebase not configured.");
        return;
      }

      const stored = await getStoredHandleByDrive(drive.id);
      if (!stored) {
        setError(
          "Drive not found locally. Please select the drive again by clicking Sync."
        );
        return;
      }

      const permission = await requestPermission(stored.handle);
      if (permission !== "granted") {
        setError("Permission denied. Please grant access when prompted.");
        return;
      }

      const controller = new AbortController();
      setAbortController(controller);
      setError(null);
      setSyncProgress({
        snapshotId: "",
        status: "in_progress",
        filesTotal: 0,
        filesCompleted: 0,
        bytesTotal: 0,
        bytesSynced: 0,
        currentFile: null,
      });

      const db = getFirebaseFirestore();
      let failStep = "";

      try {
        failStep = "create backup snapshot";
        const snapshotRef = await addDoc(collection(db, "backup_snapshots"), {
          linked_drive_id: drive.id,
          userId: user.uid,
          status: "in_progress",
          files_count: 0,
          bytes_synced: 0,
          started_at: new Date(),
        });
        const snapshotId = snapshotRef.id;

        const files: {
          file: File;
          relativePath: string;
          modifiedAt: number | null;
        }[] = [];
        let bytesTotal = 0;

        for await (const entry of enumerateFiles(stored.handle)) {
          if (controller.signal.aborted) break;
          files.push({
            file: entry.file,
            relativePath: entry.relativePath,
            modifiedAt: entry.modifiedAt,
          });
          bytesTotal += entry.size;
        }

        failStep = "query backup snapshots";
        const existingSnap = await getDocs(
          query(
            collection(db, "backup_snapshots"),
            where("userId", "==", user.uid),
            where("linked_drive_id", "==", drive.id),
            where("status", "==", "completed"),
            orderBy("completed_at", "desc"),
            limit(1)
          )
        );
        const existingFiles: { relative_path: string; modified_at: string | null }[] = [];
        if (!existingSnap.empty) {
          failStep = "query backup files";
          const filesSnap = await getDocs(
            query(
              collection(db, "backup_files"),
              where("backup_snapshot_id", "==", existingSnap.docs[0].id)
            )
          );
          filesSnap.docs.forEach((d) => {
            const d2 = d.data();
            existingFiles.push({
              relative_path: d2.relative_path,
              modified_at: d2.modified_at ?? null,
            });
          });
        }
        const existingMap = new Map(
          existingFiles.map((f) => [
            f.relative_path,
            f.modified_at ? new Date(f.modified_at).getTime() : null,
          ])
        );

        const toUpload = files.filter((f) => {
          const existingMtime = existingMap.get(f.relativePath);
          if (existingMtime === undefined) return true;
          if (f.modifiedAt === null) return existingMtime === null;
          if (existingMtime === null) return true;
          return f.modifiedAt > existingMtime;
        });

        setSyncProgress({
          snapshotId,
          status: "in_progress",
          filesTotal: toUpload.length,
          filesCompleted: 0,
          bytesTotal: toUpload.reduce((acc, f) => acc + f.file.size, 0),
          bytesSynced: 0,
          currentFile: toUpload[0]?.relativePath ?? null,
        });

        if (toUpload.length > 0) {
          failStep = "upload auth (pre-flight)";
          const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
          if (!idToken) throw new Error("Not authenticated. Sign out and back in, then try again.");
          const preflight = await fetch("/api/backup/upload-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              drive_id: drive.id,
              relative_path: toUpload[0].relativePath,
              content_type: toUpload[0].file.type || "application/octet-stream",
              user_id: user.uid,
              validate_only: true,
            }),
          });
          if (!preflight.ok) {
            const data = await preflight.json().catch(() => ({}));
            const fallback =
              preflight.status === 401
                ? "Upload auth failed. Production: set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel. Check /api/backup/auth-status for config."
                : `Upload auth failed: ${preflight.status}`;
            throw new Error(data?.error ?? fallback);
          }
        }

        let bytesSynced = 0;
        let filesCompleted = 0;
        const failedFiles: string[] = [];
        const MAX_RETRIES = 2;

        for (let i = 0; i < toUpload.length; i++) {
          if (controller.signal.aborted) break;

          const { file, relativePath, modifiedAt } = toUpload[i];

          setSyncProgress((prev) =>
            prev
              ? {
                  ...prev,
                  currentFile: relativePath,
                  filesCompleted,
                  bytesSynced,
                }
              : null
          );

          const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
          const objectKey = `backups/${user.uid}/${drive.id}/${safePath}`;
          const contentType = file.type || "application/octet-stream";

          let lastError: string | null = null;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              const idToken = await getFirebaseAuth().currentUser?.getIdToken(
                true
              );
              if (!idToken) throw new Error("Not authenticated. Sign in again.");

              const urlRes = await fetch("/api/backup/upload-url", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  drive_id: drive.id,
                  relative_path: relativePath,
                  content_type: contentType,
                  user_id: user.uid,
                }),
              });

              if (urlRes.ok) {
                const { uploadUrl } = await urlRes.json();
                const putRes = await fetch(uploadUrl, {
                  method: "PUT",
                  body: file,
                  headers: { "Content-Type": contentType },
                  signal: controller.signal,
                });
                if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);
              } else {
                const data = await urlRes.json().catch(() => ({}));
                if (urlRes.status === 503) {
                  throw new Error(
                    data?.error ?? "Backblaze B2 is not configured. All backup storage uses B2."
                  );
                }
                throw new Error(data?.error ?? "Failed to get upload URL");
              }

              await addDoc(collection(db, "backup_files"), {
                backup_snapshot_id: snapshotId,
                linked_drive_id: drive.id,
                userId: user.uid,
                relative_path: relativePath,
                object_key: objectKey,
                size_bytes: file.size,
                modified_at: modifiedAt ? new Date(modifiedAt).toISOString() : null,
              });

              bytesSynced += file.size;
              filesCompleted++;
              lastError = null;
              break;
            } catch (err) {
              lastError =
                err instanceof Error ? err.message : "Upload failed";
            }
            if (attempt < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
          }
          if (lastError) {
            failedFiles.push(`${relativePath}: ${lastError}`);
          }
        }

        const completeError =
          controller.signal.aborted
            ? "Cancelled"
            : failedFiles.length > 0
              ? `${failedFiles.length} file(s) failed`
              : null;

        failStep = "update backup snapshot";
        await updateDoc(doc(db, "backup_snapshots", snapshotId), {
          status:
            controller.signal.aborted || failedFiles.length > 0
              ? "failed"
              : "completed",
          files_count: filesCompleted,
          bytes_synced: bytesSynced,
          error_message: completeError,
          completed_at: new Date(),
        });

        if (!controller.signal.aborted && failedFiles.length === 0) {
          failStep = "update drive / profile";
          await updateDoc(doc(db, "linked_drives", drive.id), {
            last_synced_at: new Date().toISOString(),
          });

          const profileRef = doc(db, "profiles", user.uid);
          const profileSnap = await getDoc(profileRef);
          const current = profileSnap.exists()
            ? (profileSnap.data().storage_used_bytes ?? 0) + bytesSynced
            : bytesSynced;
          await setDoc(
            profileRef,
            {
              userId: user.uid,
              email: user.email ?? null,
              storage_used_bytes: current,
              storage_quota_bytes: 53687091200,
            },
            { merge: true }
          );
        }

        setSyncProgress((prev) =>
          prev
            ? {
                ...prev,
                status:
                  controller.signal.aborted || failedFiles.length > 0
                    ? "failed"
                    : "completed",
                filesCompleted,
                bytesSynced,
                currentFile: null,
                error:
                  controller.signal.aborted
                    ? "Cancelled"
                    : failedFiles.length > 0
                      ? `${failedFiles.length} file(s) failed to upload`
                      : undefined,
              }
            : null
        );

        if (!controller.signal.aborted) {
          fetchDrives();
          setStorageVersion((v) => v + 1);
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Sync failed";
        const permHint =
          raw.toLowerCase().includes("insufficient") ||
          raw.toLowerCase().includes("permission denied");
        const message = permHint
          ? failStep
            ? `[${failStep}] ${raw} — Deploy rules: firebase deploy --only firestore:rules (confirm project: firebase use)`
            : `${raw} — Deploy rules: firebase deploy --only firestore:rules (confirm project: firebase use)`
          : raw;
        setError(message);
        setSyncProgress((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                error: message,
              }
            : null
        );
      } finally {
        setAbortController(null);
      }
    },
    [user, requestPermission, getStoredHandleByDrive, fetchDrives]
  );

  const cancelSync = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, [abortController]);

  const pickDirectory = useCallback(async () => pickDir(), [pickDir]);

  const unlinkDrive = useCallback(
    async (drive: LinkedDrive) => {
      if (!isFirebaseConfigured() || !user) return;
      const db = getFirebaseFirestore();
      await deleteDoc(doc(db, "linked_drives", drive.id));
      try {
        await deleteStoredHandle(drive.id);
      } catch {
        // Handle may not exist in IndexedDB
      }
      setLinkedDrives((prev) => prev.filter((d) => d.id !== drive.id));
      setStorageVersion((v) => v + 1);
    },
    [user, deleteStoredHandle]
  );

  const getOrCreateUploadsDrive = useCallback(async (): Promise<LinkedDrive> => {
    if (!isFirebaseConfigured() || !user) throw new Error("Not authenticated");
    const db = getFirebaseFirestore();
    const existing = await getDocs(
      query(
        collection(db, "linked_drives"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      )
    );
    const uploadsDrive = existing.docs.find((d) => d.data().name === "Uploads");
    if (uploadsDrive) {
      const d = uploadsDrive;
      const data = d.data();
      return {
        id: d.id,
        user_id: data.userId,
        name: data.name,
        mount_path: data.mount_path ?? null,
        permission_handle_id: data.permission_handle_id ?? null,
        last_synced_at: data.last_synced_at ?? null,
        created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      };
    }
    const docRef = await addDoc(collection(db, "linked_drives"), {
      userId: user.uid,
      name: "Uploads",
      permission_handle_id: `uploads-${Date.now()}`,
      createdAt: new Date(),
    });
    const drive: LinkedDrive = {
      id: docRef.id,
      user_id: user.uid,
      name: "Uploads",
      mount_path: null,
      permission_handle_id: `uploads-${Date.now()}`,
      last_synced_at: null,
      created_at: new Date().toISOString(),
    };
    setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);
    return drive;
  }, [user]);

  const uploadSingleFile = useCallback(
    async (file: File) => {
      if (!isFirebaseConfigured() || !user) {
        setError("Please sign in to upload.");
        return;
      }
      setError(null);
      const drive = await getOrCreateUploadsDrive();
      const db = getFirebaseFirestore();
      const relativePath = file.name;
      const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
      const objectKey = `backups/${user.uid}/${drive.id}/${safePath}`;
      const contentType = file.type || "application/octet-stream";
      try {
        const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!idToken) throw new Error("Not authenticated. Sign in again.");
        const urlRes = await fetch("/api/backup/upload-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            drive_id: drive.id,
            relative_path: relativePath,
            content_type: contentType,
            user_id: user.uid,
          }),
        });
        if (!urlRes.ok) {
          const data = await urlRes.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to get upload URL");
        }
        const { uploadUrl } = await urlRes.json();
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": contentType },
        });
        if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);
        const snapshotRef = await addDoc(collection(db, "backup_snapshots"), {
          linked_drive_id: drive.id,
          userId: user.uid,
          status: "completed",
          files_count: 1,
          bytes_synced: file.size,
          completed_at: new Date(),
        });
        await addDoc(collection(db, "backup_files"), {
          backup_snapshot_id: snapshotRef.id,
          linked_drive_id: drive.id,
          userId: user.uid,
          relative_path: relativePath,
          object_key: objectKey,
          size_bytes: file.size,
          modified_at: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        });
        await updateDoc(doc(db, "linked_drives", drive.id), {
          last_synced_at: new Date().toISOString(),
        });
        setStorageVersion((v) => v + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [user, getOrCreateUploadsDrive]
  );

  const uploadFolder = useCallback(async () => {
    if (!fsAccessSupported) return;
    try {
      const handle = await pickDir();
      const drive = await linkDrive(handle.name, handle);
      await startSync(drive);
    } catch (err) {
      console.error(err);
    }
  }, [fsAccessSupported, pickDir, linkDrive, startSync]);

  const value = useMemo<BackupContextValue>(
    () => ({
      linkedDrives,
      loading,
      error,
      syncProgress,
      isSyncing: !!abortController,
      storageVersion,
      fetchDrives,
      linkDrive,
      startSync,
      cancelSync,
      pickDirectory,
      unlinkDrive,
      uploadSingleFile,
      uploadFolder,
      fsAccessSupported,
    }),
    [
      linkedDrives,
      loading,
      error,
      syncProgress,
      abortController,
      storageVersion,
      fetchDrives,
      linkDrive,
      startSync,
      cancelSync,
      pickDirectory,
      unlinkDrive,
      uploadSingleFile,
      uploadFolder,
      fsAccessSupported,
    ]
  );

  return (
    <BackupContext.Provider value={value}>{children}</BackupContext.Provider>
  );
}

export function useBackup() {
  const ctx = useContext(BackupContext);
  if (!ctx) throw new Error("useBackup must be used within BackupProvider");
  return ctx;
}
