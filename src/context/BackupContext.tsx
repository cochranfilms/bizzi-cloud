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
  /** Error from single-file upload (New → File Upload). Shown near the upload trigger, not at Sync. */
  fileUploadError: string | null;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
  storageVersion: number;
  /** Call after delete/restore/permanent-delete to refresh storage display */
  bumpStorageVersion: () => void;
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
  clearFileUploadError: () => void;
  fsAccessSupported: boolean;
}

/** Video extensions that trigger proxy generation (720p H.264). */
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

/** B2 minimum part size 5MB; use 8MB for throughput. Must match server. */
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_THRESHOLD = 5 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 6;

/** Compute SHA256 hash of a file for content-hash storage (browser). */
async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upload blob via PUT with real-time progress. Returns ETag for multipart. */
function putWithProgress(
  blob: Blob,
  url: string,
  contentType: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
  }
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        xhr.abort();
      });
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress(e.loaded, e.total);
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("etag") ?? xhr.getResponseHeader("ETag");
        if (!etag) return reject(new Error("Response missing ETag"));
        resolve({ etag: etag.replace(/^"|"$/g, "") });
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(blob);
  });
}

async function uploadWithMultipart(
  file: File,
  driveId: string,
  relativePath: string,
  contentType: string,
  contentHash: string,
  idToken: string,
  userId: string | null,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ objectKey: string }> {
  const initRes = await fetch("/api/backup/multipart-init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      drive_id: driveId,
      relative_path: relativePath,
      content_type: contentType,
      content_hash: contentHash,
      size_bytes: file.size,
      user_id: userId,
    }),
  });
  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to init multipart upload");
  }
  const init = await initRes.json();
  if (init.alreadyExists) return { objectKey: init.objectKey };

  const { uploadId, parts, objectKey } = init;
  if (!uploadId || !Array.isArray(parts) || parts.length === 0 || !objectKey) {
    throw new Error("Invalid multipart init response");
  }

  const partProgress = new Array<number>(parts.length).fill(0);
  let lastReportTime = 0;
  const reportProgress = () => {
    if (!onProgress) return;
    const now = Date.now();
    if (now - lastReportTime < 80) return; // throttle ~12 updates/sec
    lastReportTime = now;
    const loaded = partProgress.reduce((a, b) => a + b, 0);
    onProgress(loaded, file.size);
  };

  const uploadResults = await Promise.all(
    parts.map(
      async (
        {
          partNumber,
          uploadUrl,
        }: {
          partNumber: number;
          uploadUrl: string;
        },
        idx: number
      ) => {
        const start = (partNumber - 1) * MULTIPART_PART_SIZE;
        const end = Math.min(start + MULTIPART_PART_SIZE, file.size);
        const blob = file.slice(start, end);
        const { etag } = await putWithProgress(blob, uploadUrl, contentType, {
          signal,
          onProgress: (loaded) => {
            partProgress[idx] = loaded;
            reportProgress();
          },
        });
        partProgress[idx] = end - start;
        reportProgress();
        return { partNumber, etag };
      }
    )
  );

  const completeRes = await fetch("/api/backup/multipart-complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      object_key: objectKey,
      upload_id: uploadId,
      parts: uploadResults,
    }),
  });
  if (!completeRes.ok) {
    const data = await completeRes.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to complete multipart upload");
  }
  return { objectKey };
}

const BackupContext = createContext<BackupContextValue | null>(null);

export function BackupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [linkedDrives, setLinkedDrives] = useState<LinkedDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
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
      const currentUser = user;
      if (!currentUser) {
        setError("Please sign in to sync.");
        return;
      }
      const uid = currentUser.uid;
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
          userId: uid,
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
            where("userId", "==", uid),
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
              user_id: uid,
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

        const state = {
          bytesSynced: 0,
          filesCompleted: 0,
          failedFiles: [] as string[],
        };
        const progressState = {
          completedBytes: 0,
          inFlight: new Map<number, number>(),
          lastReport: 0,
        };

        const reportSyncProgress = (currentFile: string | null) => {
          const now = Date.now();
          if (now - progressState.lastReport < 80) return;
          progressState.lastReport = now;
          const inFlightSum = [...progressState.inFlight.values()].reduce((a, b) => a + b, 0);
          const bytesSynced = progressState.completedBytes + inFlightSum;
          setSyncProgress((prev) =>
            prev
              ? {
                  ...prev,
                  bytesSynced,
                  filesCompleted: state.filesCompleted,
                  currentFile,
                }
              : null
          );
        };

        const MAX_RETRIES = 2;

        async function uploadOne(
          item: (typeof toUpload)[0],
          index: number
        ): Promise<void> {
          if (controller.signal.aborted) return;
          const { file, relativePath, modifiedAt } = item;
          const contentType = file.type || "application/octet-stream";

          let lastError: string | null = null;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (controller.signal.aborted) return;
            try {
              const contentHash = await sha256Hex(file);
              const idToken =
                await getFirebaseAuth().currentUser?.getIdToken(true);
              if (!idToken) throw new Error("Not authenticated. Sign in again.");

              let objectKey: string;
              if (file.size > MULTIPART_THRESHOLD) {
                progressState.inFlight.set(index, 0);
                const res = await uploadWithMultipart(
                  file,
                  drive.id,
                  relativePath,
                  contentType,
                  contentHash,
                  idToken,
                  uid,
                  controller.signal,
                  (loaded) => {
                    progressState.inFlight.set(index, loaded);
                    reportSyncProgress(toUpload[index + 1]?.relativePath ?? null);
                  }
                );
                objectKey = res.objectKey;
              } else {
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
                    content_hash: contentHash,
                    user_id: uid,
                  }),
                });
                if (!urlRes.ok) {
                  const data = await urlRes.json().catch(() => ({}));
                  if (urlRes.status === 503) {
                    throw new Error(
                      data?.error ??
                        "Backblaze B2 is not configured. All backup storage uses B2."
                    );
                  }
                  throw new Error(data?.error ?? "Failed to get upload URL");
                }
                const res = await urlRes.json();
                objectKey = res.objectKey;
                if (!res.alreadyExists && res.uploadUrl) {
                  progressState.inFlight.set(index, 0);
                  await putWithProgress(
                    file,
                    res.uploadUrl,
                    contentType,
                    {
                      signal: controller.signal,
                      onProgress: (loaded) => {
                        progressState.inFlight.set(index, loaded);
                        reportSyncProgress(toUpload[index + 1]?.relativePath ?? null);
                      },
                    }
                  );
                }
              }

              progressState.inFlight.delete(index);
              progressState.completedBytes += file.size;

              await addDoc(collection(db, "backup_files"), {
                backup_snapshot_id: snapshotId,
                linked_drive_id: drive.id,
                userId: uid,
                relative_path: relativePath,
                object_key: objectKey,
                size_bytes: file.size,
                modified_at: modifiedAt
                  ? new Date(modifiedAt).toISOString()
                  : null,
                deleted_at: null,
              });

              if (VIDEO_EXT.test(relativePath)) {
                fetch("/api/backup/generate-proxy", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({
                    object_key: objectKey,
                    name: relativePath,
                  }),
                }).catch(() => {});
              }

              state.bytesSynced += file.size;
              state.filesCompleted++;
              progressState.lastReport = 0; // Force immediate update on completion
              reportSyncProgress(toUpload[index + 1]?.relativePath ?? null);
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
            state.failedFiles.push(`${relativePath}: ${lastError}`);
          }
        }

        // Run uploads with concurrency limit
        let nextIndex = 0;
        async function worker(): Promise<void> {
          while (nextIndex < toUpload.length && !controller.signal.aborted) {
            const i = nextIndex++;
            await uploadOne(toUpload[i], i);
          }
        }
        const workers = Array.from(
          { length: Math.min(UPLOAD_CONCURRENCY, toUpload.length) },
          () => worker()
        );
        await Promise.all(workers);

        const { bytesSynced, filesCompleted } = state;
        const failedFiles = state.failedFiles;

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

          const profileRef = doc(db, "profiles", uid);
          const profileSnap = await getDoc(profileRef);
          const current = profileSnap.exists()
            ? (profileSnap.data().storage_used_bytes ?? 0) + bytesSynced
            : bytesSynced;
          await setDoc(
            profileRef,
            {
              userId: uid,
              email: currentUser.email ?? null,
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
      setFileUploadError(null);

      const drive = await getOrCreateUploadsDrive();
      const db = getFirebaseFirestore();
      const relativePath = file.name;
      const contentType = file.type || "application/octet-stream";

      setSyncProgress({
        snapshotId: "",
        status: "in_progress",
        filesTotal: 1,
        filesCompleted: 0,
        bytesTotal: file.size,
        bytesSynced: 0,
        currentFile: file.name,
      });

      try {
        const contentHash = await sha256Hex(file);
        const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!idToken) throw new Error("Not authenticated. Sign in again.");

        let objectKey: string;
        if (file.size > MULTIPART_THRESHOLD) {
          const res = await uploadWithMultipart(
            file,
            drive.id,
            relativePath,
            contentType,
            contentHash,
            idToken,
            user.uid,
            undefined,
            (loaded) => {
              setSyncProgress((prev) =>
                prev ? { ...prev, bytesSynced: loaded } : null
              );
            }
          );
          objectKey = res.objectKey;
        } else {
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
              content_hash: contentHash,
              user_id: user.uid,
            }),
          });
          if (!urlRes.ok) {
            const data = await urlRes.json().catch(() => ({}));
            throw new Error(data?.error ?? "Failed to get upload URL");
          }
          const { uploadUrl, objectKey: ok, alreadyExists } = await urlRes.json();
          objectKey = ok;
          if (!alreadyExists && uploadUrl) {
            await putWithProgress(file, uploadUrl, contentType, {
              onProgress: (loaded) => {
                setSyncProgress((prev) =>
                  prev ? { ...prev, bytesSynced: loaded } : null
                );
              },
            });
          }
        }
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
          modified_at: file.lastModified
            ? new Date(file.lastModified).toISOString()
            : null,
          deleted_at: null,
        });
        if (VIDEO_EXT.test(relativePath)) {
          fetch("/api/backup/generate-proxy", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              object_key: objectKey,
              name: relativePath,
            }),
          }).catch(() => {});
        }
        await updateDoc(doc(db, "linked_drives", drive.id), {
          last_synced_at: new Date().toISOString(),
        });
        setStorageVersion((v) => v + 1);
        setSyncProgress((prev) =>
          prev ? { ...prev, status: "completed", bytesSynced: file.size } : null
        );
        setTimeout(() => setSyncProgress(null), 2000);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message || (err as Error & { name?: string }).name || "Upload failed"
            : "Upload failed";
        setFileUploadError(msg);
        setSyncProgress(null);
      }
    },
    [user, getOrCreateUploadsDrive]
  );

  const clearFileUploadError = useCallback(() => setFileUploadError(null), []);

  const bumpStorageVersion = useCallback(
    () => setStorageVersion((v) => v + 1),
    []
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
      fileUploadError,
      syncProgress,
      isSyncing: !!abortController,
      storageVersion,
      bumpStorageVersion,
      fetchDrives,
      linkDrive,
      startSync,
      cancelSync,
      pickDirectory,
      unlinkDrive,
      uploadSingleFile,
      uploadFolder,
      clearFileUploadError,
      fsAccessSupported,
    }),
    [
      linkedDrives,
      loading,
      error,
      syncProgress,
      abortController,
      storageVersion,
      bumpStorageVersion,
      fetchDrives,
      linkDrive,
      startSync,
      cancelSync,
      pickDirectory,
      unlinkDrive,
      uploadSingleFile,
      uploadFolder,
      clearFileUploadError,
      fileUploadError,
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
