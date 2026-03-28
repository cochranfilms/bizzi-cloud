"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  onSnapshot,
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { isPersonalScopeDriveDoc, isTeamContainerDriveDoc } from "@/lib/backup-scope";
import type { LinkedDrive, FileUploadProgress, FileUploadItem } from "@/types/backup";
import { UploadManager, type QueuedFile } from "@/lib/upload-manager";
import {
  useFileSystemAccess,
  isFileSystemAccessSupported,
} from "@/hooks/useFileSystemAccess";
import {
  getFirebaseFirestore,
  getFirebaseAuth,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import { getCurrentUserIdToken } from "@/lib/auth-token";
import { useAuth } from "@/context/AuthContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { usePathname } from "next/navigation";
import StorageQuotaExceededModal from "@/components/dashboard/StorageQuotaExceededModal";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";
import { getUploadRelativePath } from "@/lib/uppy-local-preview";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { linkedDriveMatchesGalleryMediaScope } from "@/lib/gallery-media-drive-match";
import {
  flatMacosPackageUserMessage,
  isLikelyFlatMacosPackageBrowserUpload,
} from "@/lib/macos-package-bundles";

interface BackupContextValue {
  linkedDrives: LinkedDrive[];
  loading: boolean;
  error: string | null;
  /** Error from single-file upload (New → File Upload). Shown near the upload trigger. */
  fileUploadError: string | null;
  storageVersion: number;
  /** Call after delete/restore/permanent-delete to refresh storage display */
  bumpStorageVersion: () => void;
  fetchDrives: () => Promise<void>;
  linkDrive: (
    name: string,
    handle: FileSystemDirectoryHandle
  ) => Promise<LinkedDrive>;
  pickDirectory: () => Promise<FileSystemDirectoryHandle>;
  unlinkDrive: (drive: LinkedDrive) => Promise<void>;
  uploadSingleFile: (file: File, targetDriveId?: string) => Promise<void>;
  /** Upload multiple files sequentially with per-file progress. Used by New → File Upload. */
  uploadFiles: (
    files: File[],
    targetDriveId?: string,
    options?: {
      onFileComplete?: (file: { name: string; path: string; backupFileId?: string; objectKey?: string }) => void;
    }
  ) => Promise<void>;
  /** Cancel a specific file's upload and remove any partial chunks from Backblaze. */
  cancelFileUpload: (fileId: string) => void;
  fileUploadProgress: FileUploadProgress | null;
  clearFileUploadError: () => void;
  fsAccessSupported: boolean;
  /** Create a new empty folder (linked drive). */
  createFolder: (name: string, options?: { creatorSection?: boolean }) => Promise<LinkedDrive>;
  /** Get or create the main Storage drive. */
  getOrCreateStorageDrive: () => Promise<LinkedDrive>;
  /** Get or create the permanent RAW drive for Creator tab (video-only). */
  getOrCreateCreatorRawDrive: () => Promise<LinkedDrive>;
  /** Get or create the Gallery Media drive for gallery uploads. */
  getOrCreateGalleryDrive: () => Promise<LinkedDrive>;
  /** ID of the Creator RAW drive, if any (for LUT preview gating). */
  creatorRawDriveId: string | null;
  /** Upload files directly to a gallery (uses Gallery Media drive, adds to gallery on complete). */
  uploadFilesToGallery: (
    files: File[],
    galleryId: string,
    options?: { onComplete?: () => void; galleryTitle?: string }
  ) => Promise<void>;
}

/** Video extensions that trigger proxy generation (720p H.264). */
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function personalTeamFileFields(drive: LinkedDrive): Record<string, unknown> {
  if (drive.personal_team_owner_id) {
    return { personal_team_owner_id: drive.personal_team_owner_id };
  }
  return {};
}

/** Fetch workspace fields for org drive uploads. Returns {} for personal. */
async function getWorkspaceFieldsForOrgDrive(
  drive: LinkedDrive,
  idToken: string | null | undefined,
  userId: string,
  selectedWorkspaceId?: string | null
): Promise<Record<string, unknown>> {
  const orgId = drive.organization_id ?? null;
  if (!orgId || !idToken) return {};
  try {
    const params = new URLSearchParams({
      drive_id: drive.id,
      organization_id: orgId,
    });
    if (selectedWorkspaceId) params.set("workspace_id", selectedWorkspaceId);
    const res = await fetch(`/api/workspaces/default-for-drive?${params}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      workspace_id?: string;
      visibility_scope?: string;
      drive_id?: string;
    };
    const wid = data.workspace_id;
    if (!wid) return {};
    return {
      workspace_id: wid,
      visibility_scope: data.visibility_scope ?? "private_org",
      owner_user_id: userId,
    };
  } catch {
    return {};
  }
}

/** B2 minimum part size 5MB; use 8MB for throughput. Must match server. */
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_THRESHOLD = 5 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 6;

/** Above this size, skip content hash to avoid blocking upload start (8K/BRAW). */
const CONTENT_HASH_SKIP_THRESHOLD = 20 * 1024 * 1024 * 1024;

/** Chunk size for streaming hash (avoids loading entire file into memory). */
const HASH_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

/** Compute SHA256 hash of a file for content-hash storage (browser).
 * Uses streaming for large files to avoid memory issues; same hash for duplicates. */
async function sha256Hex(file: File): Promise<string> {
  if (file.size <= HASH_CHUNK_SIZE) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createSHA256 } = await import("hash-wasm");
  const sha256 = await createSHA256();
  sha256.init();
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + HASH_CHUNK_SIZE);
    const buf = await chunk.arrayBuffer();
    sha256.update(new Uint8Array(buf));
    offset += HASH_CHUNK_SIZE;
  }
  return sha256.digest("hex");
}

/** Upload blob via PUT with real-time progress. Returns ETag for multipart. */
function putWithProgress(
  blob: Blob,
  url: string,
  contentType: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
    /** Required for single-file presigned PUT (B2 SSE-B2). Omit for multipart parts. */
    sseRequired?: boolean;
  }
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (options.sseRequired) xhr.setRequestHeader("x-amz-server-side-encryption", "AES256");

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

/** Retry a part upload on transient network errors (e.g. ERR_NETWORK_CHANGED).
 * Uses exponential backoff with jitter to handle flaky connections and slow HDs. */
async function putPartWithRetry(
  blob: Blob,
  url: string,
  contentType: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
  },
  maxRetries = 6
): Promise<{ etag: string }> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await putWithProgress(blob, url, contentType, options);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (lastErr.message === "Upload aborted") throw lastErr;
      if (attempt < maxRetries - 1) {
        const baseDelay = Math.min(2000 * 2 ** attempt, 20000);
        const jitter = Math.random() * 2000;
        await new Promise((r) => setTimeout(r, baseDelay + jitter));
      }
    }
  }
  throw lastErr ?? new Error("Upload failed");
}

/** Run async tasks with limited concurrency. */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

async function releaseStorageReservationClient(
  reservationId: string | null | undefined,
  idToken: string | null
): Promise<void> {
  if (!reservationId || !idToken) return;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  await fetch(`${base}/api/storage/reservation/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ reservation_id: reservationId }),
  }).catch(() => {});
}

async function commitStorageReservationClient(
  reservationId: string | null | undefined,
  idToken: string | null
): Promise<void> {
  if (!reservationId || !idToken) return;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  await fetch(`${base}/api/storage/reservation/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ reservation_id: reservationId }),
  }).catch(() => {});
}

async function uploadWithMultipart(
  file: File,
  driveId: string,
  relativePath: string,
  contentType: string,
  contentHash: string | null,
  idToken: string,
  userId: string | null,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
  onMultipartAbort?: (objectKey: string, uploadId: string) => Promise<void>
): Promise<{ objectKey: string; reservation_id: string | null }> {
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
    if (initRes.status === 403 && data?.storage_denial) {
      const e = new Error(
        typeof data.error === "string" ? data.error : "Storage limit reached"
      ) as Error & { storage_denial?: unknown };
      e.storage_denial = data.storage_denial;
      throw e;
    }
    throw new Error(data?.error ?? "Failed to init multipart upload");
  }
  const init = await initRes.json();
  if (init.alreadyExists) return { objectKey: init.objectKey, reservation_id: null };

  const { uploadId, parts, objectKey, reservation_id } = init as {
    uploadId: string;
    parts: { partNumber: number; uploadUrl: string }[];
    objectKey: string;
    reservation_id?: string | null;
  };
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

  try {
    // Use lower concurrency for very large files to avoid overwhelming slow/unstable connections
    const concurrency =
      file.size > 1024 * 1024 * 1024 ? 3 : UPLOAD_CONCURRENCY;
    const uploadResults = await runWithConcurrency(
      parts,
      concurrency,
      async (
        {
          partNumber,
          uploadUrl,
        }: { partNumber: number; uploadUrl: string },
        idx: number
      ) => {
        const start = (partNumber - 1) * MULTIPART_PART_SIZE;
        const end = Math.min(start + MULTIPART_PART_SIZE, file.size);
        const blob = file.slice(start, end);
        const { etag } = await putPartWithRetry(
          blob,
          uploadUrl,
          contentType,
          {
            signal,
            onProgress: (loaded) => {
              partProgress[idx] = loaded;
              reportProgress();
            },
          }
        );
        partProgress[idx] = end - start;
        reportProgress();
        return { partNumber, etag };
      }
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
        reservation_id: reservation_id ?? null,
      }),
    });
    if (!completeRes.ok) {
      const data = await completeRes.json().catch(() => ({}));
      throw new Error(data?.error ?? "Failed to complete multipart upload");
    }
    return { objectKey, reservation_id: reservation_id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    if (msg === "Upload aborted" && onMultipartAbort) {
      await onMultipartAbort(objectKey, uploadId);
    }
    throw err;
  }
}

const BackupContext = createContext<BackupContextValue | null>(null);

/** True when pathname is under /enterprise (enterprise storage context). */
function useIsEnterpriseContext(): boolean {
  const pathname = usePathname();
  return typeof pathname === "string" && pathname.startsWith("/enterprise");
}

/** Team workspace: `/team/{ownerUid}/...` — drives scoped to that owner's personal team container. */
function useTeamRouteOwnerUid(): string | null {
  const pathname = usePathname();
  const m = typeof pathname === "string" ? /^\/team\/([^/]+)/.exec(pathname) : null;
  return m?.[1]?.trim() || null;
}

/** Owner viewing their own team route: writes must tag drives/files with personal_team_owner_id. */
function isPersonalTeamOwnerRoute(teamRouteOwnerUid: string | null, uid: string | undefined): boolean {
  return !!uid && !!teamRouteOwnerUid && teamRouteOwnerUid === uid;
}

function teamContainerWriteFields(
  teamRouteOwnerUid: string | null,
  uid: string | undefined
): Record<string, unknown> {
  if (!isPersonalTeamOwnerRoute(teamRouteOwnerUid, uid)) return {};
  return { personal_team_owner_id: uid as string };
}

/** On `/team/[ownerUid]` as a seat member (not the owner). */
function isPersonalTeamSeatOnRoute(
  teamRouteOwnerUid: string | null,
  uid: string | undefined
): boolean {
  return Boolean(teamRouteOwnerUid && uid && teamRouteOwnerUid !== uid);
}

async function createPersonalTeamDriveViaApi(
  getIdToken: () => Promise<string>,
  teamOwnerUserId: string,
  body: { name: string; creator_section?: boolean; is_creator_raw?: boolean }
): Promise<LinkedDrive> {
  const token = await getIdToken();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const res = await fetch(`${origin}/api/personal-team/create-drive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      team_owner_user_id: teamOwnerUserId,
      name: body.name,
      creator_section: body.creator_section,
      is_creator_raw: body.is_creator_raw,
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody.error as string) ?? `Could not create team folder (${res.status})`
    );
  }
  const payload = (await res.json()) as { drive: LinkedDrive };
  return payload.drive;
}

export function BackupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const { selectedWorkspaceId } = useCurrentFolder();
  const isEnterpriseContext = useIsEnterpriseContext();
  const teamRouteOwnerUid = useTeamRouteOwnerUid();
  const [linkedDrives, setLinkedDrives] = useState<LinkedDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [storageVersion, setStorageVersion] = useState(0);
  const [fileUploadProgress, setFileUploadProgress] =
    useState<FileUploadProgress | null>(null);
  const [storageQuotaExceeded, setStorageQuotaExceeded] = useState<{
    attemptedBytes: number;
    usedBytes: number;
    quotaBytes: number | null;
    isOrganizationUser: boolean;
    storage_denial?: {
      usage_scope: string;
      requesting_user_id: string;
      billing_subject_user_id: string | null;
      organization_id: string | null;
      effective_billable_bytes_for_enforcement: number;
      reserved_bytes: number;
    };
  } | null>(null);
  const ensureDrivesAttemptedRef = useRef(false);
  const fileUploadAbortRef = useRef<Map<string, AbortController>>(new Map());
  const fileUploadMultipartRef = useRef<
    Map<string, { objectKey: string; uploadId: string }>
  >(new Map());
  const uploadManagerRef = useRef<UploadManager | null>(null);

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

    // Enterprise: org filters linked_drives. Until org resolves, do not apply the "no org" filter
    // (would show wrong/empty drives then swap — harsh flash on dashboard).
    if (isEnterpriseContext && !teamRouteOwnerUid && !org?.id) {
      setLinkedDrives([]);
      setLoading(true);
      return;
    }

    try {
      setError(null);

      if (!isEnterpriseContext && teamRouteOwnerUid) {
        const token = await user.getIdToken();
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(
          `${origin}/api/personal-team/team-drives?owner_uid=${encodeURIComponent(teamRouteOwnerUid)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            (errBody.error as string) ??
              `Could not load team workspace drives (${res.status})`
          );
        }
        const payload = await res.json();
        const teamDrives = (payload.drives ?? []) as LinkedDrive[];
        setLinkedDrives(teamDrives);
        return;
      }

      const db = getFirebaseFirestore();
      const q = query(
        collection(db, "linked_drives"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const orgId = org?.id ?? null;
      const drives: LinkedDrive[] = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.deleted_at) continue;
        const oid = data.organization_id ?? null;
        if (isEnterpriseContext && orgId ? oid !== orgId : !!oid) continue;
        if (!isEnterpriseContext && !teamRouteOwnerUid) {
          if (data.personal_team_owner_id) continue;
        }
        let name = data.name as string;
        if (name === "Uploads") {
          await updateDoc(doc(db, "linked_drives", d.id), { name: "Storage" });
          name = "Storage";
        }
        drives.push({
          id: d.id,
          user_id: data.userId,
          name,
          mount_path: data.mount_path ?? null,
          permission_handle_id: data.permission_handle_id ?? null,
          last_synced_at: data.last_synced_at ?? null,
          created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
          organization_id: data.organization_id ?? null,
          creator_section: data.creator_section ?? false,
          is_creator_raw: data.is_creator_raw ?? false,
          is_org_shared: data.is_org_shared === true,
          personal_team_owner_id: (data.personal_team_owner_id as string | undefined) ?? null,
        });
      }

      const combined: LinkedDrive[] = drives;

      setLinkedDrives(combined);

      // Enterprise users may have joined before we created drives on accept-invite,
      // or org may have been updated with new power-ups (e.g. Full Frame) after they joined.
      // Backfill default drives when: none exist, or org has power-ups we're missing.
      const orgAddonIds = Array.isArray(org?.addon_ids) ? org.addon_ids : [];
      const hasGalleryAddon = orgAddonIds.includes("gallery") || orgAddonIds.includes("fullframe");
      const hasEditorAddon = orgAddonIds.includes("editor") || orgAddonIds.includes("fullframe");
      const hasGalleryMedia = drives.some((d) => d.name === "Gallery Media");
      const hasRaw = drives.some((d) => d.is_creator_raw);
      const needsEnsure =
        drives.length === 0 ||
        (hasGalleryAddon && !hasGalleryMedia) ||
        (hasEditorAddon && !hasRaw);
      if (
        isEnterpriseContext &&
        org?.id &&
        needsEnsure &&
        !ensureDrivesAttemptedRef.current
      ) {
        ensureDrivesAttemptedRef.current = true;
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/enterprise/ensure-drives", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            // Refetch to pick up newly created drives
            const q2 = query(
              collection(db, "linked_drives"),
              where("userId", "==", user.uid),
              orderBy("createdAt", "desc")
            );
            const snap2 = await getDocs(q2);
            const drives2: LinkedDrive[] = [];
            for (const d of snap2.docs) {
              const data = d.data();
              if (data.deleted_at) continue;
              const oid = data.organization_id ?? null;
              if (oid !== org.id) continue;
              let name = data.name as string;
              if (name === "Uploads") {
                await updateDoc(doc(db, "linked_drives", d.id), { name: "Storage" });
                name = "Storage";
              }
              drives2.push({
                id: d.id,
                user_id: data.userId,
                name,
                mount_path: data.mount_path ?? null,
                permission_handle_id: data.permission_handle_id ?? null,
                last_synced_at: data.last_synced_at ?? null,
                created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
                organization_id: data.organization_id ?? null,
                creator_section: data.creator_section ?? false,
                is_creator_raw: data.is_creator_raw ?? false,
                is_org_shared: data.is_org_shared === true,
                personal_team_owner_id:
                  (data.personal_team_owner_id as string | undefined) ?? null,
              });
            }
            setLinkedDrives(drives2);
          }
        } catch {
          ensureDrivesAttemptedRef.current = false; // Allow retry on next mount
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLinkedDrives([]);
    } finally {
      setLoading(false);
    }
  }, [user, isEnterpriseContext, org, teamRouteOwnerUid]);

  useEffect(() => {
    fetchDrives();
  }, [fetchDrives]);

  /** Real-time linked_drives so new folders and drive metadata sync without refresh (personal, enterprise, team). */
  useEffect(() => {
    if (!isFirebaseConfigured() || !user) return;

    const db = getFirebaseFirestore();
    const mapDoc = (d: QueryDocumentSnapshot): LinkedDrive | null => {
      const data = d.data();
      if (data.deleted_at) return null;
      let name = data.name as string;
      if (name === "Uploads") name = "Storage";
      return {
        id: d.id,
        user_id: data.userId,
        name,
        mount_path: data.mount_path ?? null,
        permission_handle_id: data.permission_handle_id ?? null,
        last_synced_at: data.last_synced_at ?? null,
        created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        organization_id: data.organization_id ?? null,
        creator_section: data.creator_section ?? false,
        is_creator_raw: data.is_creator_raw ?? false,
        is_org_shared: data.is_org_shared === true,
        personal_team_owner_id: (data.personal_team_owner_id as string | undefined) ?? null,
      };
    };

    // Team owner: real-time Firestore listener is allowed by rules (userId == auth).
    // Seat members: the same query fails client security rules ("insufficient permissions");
    // they rely on fetchDrives → /api/personal-team/team-drives only.
    if (!isEnterpriseContext && teamRouteOwnerUid && user.uid === teamRouteOwnerUid) {
      const qTeam = query(
        collection(db, "linked_drives"),
        where("userId", "==", teamRouteOwnerUid),
        where("personal_team_owner_id", "==", teamRouteOwnerUid),
        orderBy("createdAt", "desc")
      );
      return onSnapshot(
        qTeam,
        (snap) => {
          const drives: LinkedDrive[] = [];
          for (const d of snap.docs) {
            const data = d.data();
            if (data.deleted_at || data.organization_id) continue;
            if (!isTeamContainerDriveDoc(data as Record<string, unknown>, teamRouteOwnerUid)) continue;
            const ld = mapDoc(d as QueryDocumentSnapshot);
            if (ld) drives.push({ ...ld, personal_team_owner_id: teamRouteOwnerUid });
          }
          setLinkedDrives(drives);
        },
        (err) => console.error("[BackupContext] team drives listener:", err)
      );
    }

    // Seat member on /team/{owner}: only fetchDrives (API) may load owner's team drives; do not
    // subscribe to userId == member (that list is personal drives and would replace the team list).
    if (!isEnterpriseContext && teamRouteOwnerUid && user.uid !== teamRouteOwnerUid) {
      return () => {};
    }

    const q = query(
      collection(db, "linked_drives"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        const orgIdLocal = org?.id ?? null;
        if (isEnterpriseContext && !orgIdLocal) {
          return;
        }
        const drives: LinkedDrive[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.deleted_at) continue;
          const oid = data.organization_id ?? null;
          if (isEnterpriseContext && orgIdLocal ? oid !== orgIdLocal : !!oid) continue;
          if (!isEnterpriseContext && !teamRouteOwnerUid) {
            if (data.personal_team_owner_id) continue;
          }
          const ld = mapDoc(d as QueryDocumentSnapshot);
          if (ld) drives.push(ld);
        }
        setLinkedDrives(drives);
      },
      (err) => console.error("[BackupContext] linked_drives listener:", err)
    );
  }, [user, isEnterpriseContext, org?.id, teamRouteOwnerUid]);

  useEffect(() => {
    ensureDrivesAttemptedRef.current = false;
  }, [org?.id]);

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
      const orgId = isEnterpriseContext && org?.id ? org.id : null;
      const docRef = await addDoc(collection(db, "linked_drives"), {
        userId: user.uid,
        name: name || handle.name,
        permission_handle_id: `${handle.name}-${Date.now()}`,
        createdAt: new Date(),
        ...(orgId ? { organization_id: orgId } : { organization_id: null }),
        ...teamContainerWriteFields(teamRouteOwnerUid, user.uid),
      });

      const drive: LinkedDrive = {
        id: docRef.id,
        user_id: user.uid,
        name: name || handle.name,
        mount_path: null,
        permission_handle_id: `${handle.name}-${Date.now()}`,
        last_synced_at: null,
        created_at: new Date().toISOString(),
        organization_id: orgId ?? null,
        personal_team_owner_id: isPersonalTeamOwnerRoute(teamRouteOwnerUid, user.uid)
          ? user.uid
          : null,
      };

      await saveHandleToStore(drive.id, drive.id, drive.name, handle);
      setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);

      return drive;
    },
    [user, isEnterpriseContext, org, teamRouteOwnerUid, requestPermission, saveHandleToStore]
  );


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
      // Refresh from server so all consumers (e.g. FileGrid driveFolders) update immediately
      await fetchDrives();
    },
    [user, deleteStoredHandle, fetchDrives]
  );

  const getOrCreateStorageDrive = useCallback(async (): Promise<LinkedDrive> => {
    if (!isFirebaseConfigured() || !user) throw new Error("Not authenticated");
    const db = getFirebaseFirestore();
    const existing = await getDocs(
      query(
        collection(db, "linked_drives"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      )
    );
    const orgId = isEnterpriseContext && org?.id ? org.id : null;
    const teamScoped = isPersonalTeamOwnerRoute(teamRouteOwnerUid, user.uid);
    const storageDrive = existing.docs.find((d) => {
      const data = d.data();
      if (data.is_org_shared === true) return false;
      const name = data.name as string;
      if (name !== "Storage" && name !== "Uploads") return false;
      const oid = data.organization_id ?? null;
      const pto = (data.personal_team_owner_id as string | undefined) ?? null;
      if (orgId) return oid === orgId;
      if (teamScoped) return !oid && pto === user.uid;
      return !oid && !pto;
    });
    if (storageDrive) {
      const d = storageDrive;
      const data = d.data();
      const currentName = data.name as string;
      if (currentName === "Uploads") {
        await updateDoc(doc(db, "linked_drives", d.id), { name: "Storage" });
        await fetchDrives();
      }
      return {
        id: d.id,
        user_id: data.userId,
        name: "Storage",
        mount_path: data.mount_path ?? null,
        permission_handle_id: data.permission_handle_id ?? null,
        last_synced_at: data.last_synced_at ?? null,
        created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        organization_id: data.organization_id ?? null,
        is_org_shared: data.is_org_shared === true,
        personal_team_owner_id: (data.personal_team_owner_id as string | undefined) ?? null,
      };
    }
    const docRef = await addDoc(collection(db, "linked_drives"), {
      userId: user.uid,
      name: "Storage",
      permission_handle_id: `storage-${Date.now()}`,
      createdAt: new Date(),
      is_org_shared: false,
      ...(orgId ? { organization_id: orgId } : { organization_id: null }),
      ...teamContainerWriteFields(teamRouteOwnerUid, user.uid),
    });
    const drive: LinkedDrive = {
      id: docRef.id,
      user_id: user.uid,
      name: "Storage",
      mount_path: null,
      permission_handle_id: `storage-${Date.now()}`,
      last_synced_at: null,
      created_at: new Date().toISOString(),
      organization_id: orgId ?? null,
      is_org_shared: false,
      personal_team_owner_id: teamScoped ? user.uid : null,
    };
    setLinkedDrives((prev) => [drive, ...prev.filter((ld) => ld.id !== drive.id)]);
    setStorageVersion((v) => v + 1);
    return drive;
  }, [user, isEnterpriseContext, org, fetchDrives, teamRouteOwnerUid]);

  const getOrCreateCreatorRawDrive = useCallback(async (): Promise<LinkedDrive> => {
    if (!isFirebaseConfigured() || !user) throw new Error("Not authenticated");
    const db = getFirebaseFirestore();
    const orgId = isEnterpriseContext && org?.id ? org.id : null;
    const teamScoped = isPersonalTeamOwnerRoute(teamRouteOwnerUid, user.uid);
    const existing = await getDocs(
      query(
        collection(db, "linked_drives"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      )
    );
    const rawDrive = existing.docs.find((d) => {
      const data = d.data();
      if (!data.is_creator_raw) return false;
      if (data.is_org_shared === true) return false;
      const oid = data.organization_id ?? null;
      const pto = (data.personal_team_owner_id as string | undefined) ?? null;
      if (isEnterpriseContext && orgId) return oid === orgId;
      if (teamScoped) return !oid && pto === user.uid;
      return !oid && !pto;
    });
    if (rawDrive) {
      const d = rawDrive;
      const data = d.data();
      return {
        id: d.id,
        user_id: data.userId,
        name: data.name ?? "RAW",
        mount_path: data.mount_path ?? null,
        permission_handle_id: data.permission_handle_id ?? null,
        last_synced_at: data.last_synced_at ?? null,
        created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        organization_id: data.organization_id ?? null,
        creator_section: data.creator_section ?? true,
        is_creator_raw: data.is_creator_raw ?? true,
        is_org_shared: data.is_org_shared === true,
        personal_team_owner_id: (data.personal_team_owner_id as string | undefined) ?? null,
      };
    }
    const docRef = await addDoc(collection(db, "linked_drives"), {
      userId: user.uid,
      name: "RAW",
      permission_handle_id: `creator-raw-${Date.now()}`,
      createdAt: new Date(),
      creator_section: true,
      is_creator_raw: true,
      is_org_shared: false,
      ...(orgId ? { organization_id: orgId } : { organization_id: null }),
      ...teamContainerWriteFields(teamRouteOwnerUid, user.uid),
    });
    const drive: LinkedDrive = {
      id: docRef.id,
      user_id: user.uid,
      name: "RAW",
      mount_path: null,
      permission_handle_id: `creator-raw-${Date.now()}`,
      last_synced_at: null,
      created_at: new Date().toISOString(),
      organization_id: orgId ?? null,
      creator_section: true,
      is_creator_raw: true,
      is_org_shared: false,
      personal_team_owner_id: teamScoped ? user.uid : null,
    };
    setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);
    setStorageVersion((v) => v + 1);
    return drive;
  }, [user, isEnterpriseContext, org, teamRouteOwnerUid]);

  const getOrCreateGalleryDrive = useCallback(async (): Promise<LinkedDrive> => {
    if (!isFirebaseConfigured() || !user) throw new Error("Not authenticated");
    const db = getFirebaseFirestore();
    const orgId = isEnterpriseContext && org?.id ? org.id : null;
    const teamScoped = isPersonalTeamOwnerRoute(teamRouteOwnerUid, user.uid);
    const teamSeatOnTeamRoute =
      !isEnterpriseContext &&
      !orgId &&
      isPersonalTeamSeatOnRoute(teamRouteOwnerUid, user.uid);

    if (teamSeatOnTeamRoute && teamRouteOwnerUid) {
      const fromState = linkedDrives.find(
        (d) =>
          d.name === "Gallery Media" &&
          d.personal_team_owner_id === teamRouteOwnerUid
      );
      if (fromState) return fromState;
      const drive = await createPersonalTeamDriveViaApi(
        () => user.getIdToken(),
        teamRouteOwnerUid,
        { name: "Gallery Media" }
      );
      setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);
      setStorageVersion((v) => v + 1);
      return drive;
    }

    const existing = await getDocs(
      query(
        collection(db, "linked_drives"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      )
    );
    const clientGalleryScope =
      isEnterpriseContext && orgId
        ? ({
            kind: "organization" as const,
            ownerUid: user.uid,
            organizationId: orgId,
          })
        : teamScoped
          ? ({ kind: "personal_team" as const, teamOwnerUid: user.uid })
          : ({ kind: "personal" as const, ownerUid: user.uid });
    const galleryDrive = existing.docs.find((d) =>
      linkedDriveMatchesGalleryMediaScope(d.data() as Record<string, unknown>, clientGalleryScope)
    );
    if (galleryDrive) {
      const d = galleryDrive;
      const data = d.data();
      return {
        id: d.id,
        user_id: data.userId,
        name: data.name,
        mount_path: data.mount_path ?? null,
        permission_handle_id: data.permission_handle_id ?? null,
        last_synced_at: data.last_synced_at ?? null,
        created_at: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        organization_id: data.organization_id ?? null,
        is_org_shared: data.is_org_shared === true,
        personal_team_owner_id: (data.personal_team_owner_id as string | undefined) ?? null,
      };
    }
    const docRef = await addDoc(collection(db, "linked_drives"), {
      userId: user.uid,
      name: "Gallery Media",
      permission_handle_id: `gallery-media-${Date.now()}`,
      createdAt: new Date(),
      is_org_shared: false,
      ...(orgId ? { organization_id: orgId } : { organization_id: null }),
      ...teamContainerWriteFields(teamRouteOwnerUid, user.uid),
    });
    const drive: LinkedDrive = {
      id: docRef.id,
      user_id: user.uid,
      name: "Gallery Media",
      mount_path: null,
      permission_handle_id: `gallery-media-${Date.now()}`,
      last_synced_at: null,
      created_at: new Date().toISOString(),
      organization_id: orgId ?? null,
      is_org_shared: false,
      personal_team_owner_id: teamScoped ? user.uid : null,
    };
    setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);
    setStorageVersion((v) => v + 1);
    return drive;
  }, [user, isEnterpriseContext, org, teamRouteOwnerUid, linkedDrives]);

  const createFolder = useCallback(
    async (name: string, options?: { creatorSection?: boolean }): Promise<LinkedDrive> => {
      if (!isFirebaseConfigured() || !user) throw new Error("Not authenticated");
      const orgId = isEnterpriseContext && org?.id ? org.id : null;
      const creatorSection = options?.creatorSection ?? false;
      const displayName = name.trim() || "New folder";

      if (
        !isEnterpriseContext &&
        !orgId &&
        teamRouteOwnerUid &&
        isPersonalTeamSeatOnRoute(teamRouteOwnerUid, user.uid)
      ) {
        const drive = await createPersonalTeamDriveViaApi(
          () => user.getIdToken(),
          teamRouteOwnerUid,
          { name: displayName, creator_section: creatorSection }
        );
        setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);
        setStorageVersion((v) => v + 1);
        return drive;
      }

      const db = getFirebaseFirestore();
      const teamScoped = isPersonalTeamOwnerRoute(teamRouteOwnerUid, user.uid);
      const docRef = await addDoc(collection(db, "linked_drives"), {
        userId: user.uid,
        name: displayName,
        permission_handle_id: `manual-${Date.now()}`,
        createdAt: new Date(),
        ...(orgId ? { organization_id: orgId } : { organization_id: null }),
        ...(creatorSection ? { creator_section: true } : {}),
        ...teamContainerWriteFields(teamRouteOwnerUid, user.uid),
      });
      const drive: LinkedDrive = {
        id: docRef.id,
        user_id: user.uid,
        name: displayName,
        mount_path: null,
        permission_handle_id: `manual-${Date.now()}`,
        last_synced_at: null,
        created_at: new Date().toISOString(),
        organization_id: orgId ?? null,
        creator_section: creatorSection,
        personal_team_owner_id: teamScoped ? user.uid : null,
      };
      setLinkedDrives((prev) => [drive, ...prev.filter((d) => d.id !== drive.id)]);
      setStorageVersion((v) => v + 1);
      return drive;
    },
    [user, isEnterpriseContext, org, teamRouteOwnerUid]
  );

  const creatorRawDriveId = useMemo(() => {
    const raw = linkedDrives.find(
      (d) => d.is_creator_raw === true && d.is_org_shared !== true
    );
    return raw?.id ?? null;
  }, [linkedDrives]);

  const cancelFileUpload = useCallback((fileId: string) => {
    uploadManagerRef.current?.cancel(fileId);
    const controller = fileUploadAbortRef.current.get(fileId);
    if (controller) controller.abort();
    fileUploadAbortRef.current.delete(fileId);
    setFileUploadProgress((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        files: prev.files.map((f) =>
          f.id === fileId ? { ...f, status: "cancelled" as const } : f
        ),
      };
    });
  }, []);

  const uploadFiles = useCallback(
    async (
      files: File[],
      targetDriveId?: string,
      options?: {
        onFileComplete?: (file: { name: string; path: string; backupFileId?: string; objectKey?: string }) => void;
      }
    ) => {
      if (!isFirebaseConfigured() || !user) {
        setError("Please sign in to upload.");
        return;
      }
      if (files.length === 0) return;
      setError(null);
      setFileUploadError(null);
      setStorageQuotaExceeded(null);

      // RAW folder: video-only
      let filesToUpload = files;
      const rawId = linkedDrives.find((d) => d.is_creator_raw)?.id;
      if (targetDriveId && targetDriveId === rawId) {
        const videoFiles = files.filter((f) => VIDEO_EXT.test(f.name));
        const skipped = files.length - videoFiles.length;
        if (skipped > 0) {
          setFileUploadError(`${skipped} non-video file(s) skipped. RAW folder accepts videos only.`);
        }
        filesToUpload = videoFiles;
        if (filesToUpload.length === 0) return;
      }

      const flatPkgs = filesToUpload.filter((f) => isLikelyFlatMacosPackageBrowserUpload(f));
      filesToUpload = filesToUpload.filter((f) => !isLikelyFlatMacosPackageBrowserUpload(f));
      if (flatPkgs.length > 0) {
        setFileUploadError(
          flatPkgs.length === 1
            ? flatMacosPackageUserMessage(flatPkgs[0].name)
            : `Skipped ${flatPkgs.length} macOS package(s). ${flatMacosPackageUserMessage(flatPkgs[0].name)}`
        );
      }
      if (filesToUpload.length === 0) return;

      const bytesTotal = filesToUpload.reduce((s, f) => s + f.size, 0);
      const fileItems = filesToUpload.map((f, i) => ({
        id: `upload-${Date.now()}-${i}-${f.name}`,
        name: f.name,
        size: f.size,
        bytesSynced: 0,
        status: "pending" as const,
      }));

      setFileUploadProgress({
        status: "in_progress",
        files: fileItems,
        bytesTotal,
        bytesSynced: 0,
      });

      // Pre-check storage: only cap is remaining space; show modal if over quota
      try {
        const idToken = await getCurrentUserIdToken(false);
        if (idToken) {
          const base = typeof window !== "undefined" ? window.location.origin : "";
          const contextParam = isEnterpriseContext ? "?context=enterprise" : "?context=personal";
          const res = await fetch(`${base}/api/storage/status${contextParam}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.ok) {
            const data = (await res.json()) as {
              effective_billable_bytes_for_enforcement?: number;
              billable_used_bytes?: number;
              quota_bytes: number | null;
              is_organization_user: boolean;
              _deprecated?: {
                storage_used_total_for_quota?: number;
                storage_quota_bytes?: number | null;
              };
            };
            const quota =
              data.quota_bytes ?? data._deprecated?.storage_quota_bytes ?? null;
            const usedForQuota =
              data.effective_billable_bytes_for_enforcement ??
              data._deprecated?.storage_used_total_for_quota ??
              data.billable_used_bytes ??
              0;
            if (quota !== null && usedForQuota + bytesTotal > quota) {
              setFileUploadProgress(null);
              setStorageQuotaExceeded({
                attemptedBytes: bytesTotal,
                usedBytes: usedForQuota,
                quotaBytes: quota,
                isOrganizationUser: data.is_organization_user,
              });
              return;
            }
          }
        }
      } catch {
        // Non-fatal: proceed with upload; server will reject if over quota
      }

      try {
        let drive = targetDriveId
          ? (linkedDrives.find((d) => d.id === targetDriveId) ?? await getOrCreateStorageDrive())
          : await getOrCreateStorageDrive();
        const db = getFirebaseFirestore();

        let resolvedWorkspaceId: string | null = null;
        if (isEnterpriseContext && org?.id) {
          const idToken = await getCurrentUserIdToken(false);
          if (idToken) {
            try {
              const params = new URLSearchParams({
                drive_id: drive.id,
                organization_id: org.id,
              });
              if (selectedWorkspaceId) params.set("workspace_id", selectedWorkspaceId);
              const res = await fetch(`/api/workspaces/default-for-drive?${params}`, {
                headers: { Authorization: `Bearer ${idToken}` },
              });
              if (res.ok) {
                const data = (await res.json()) as { workspace_id: string; drive_id?: string };
                resolvedWorkspaceId = data.workspace_id;
                if (data.drive_id && data.drive_id !== drive.id) {
                  const altDrive = linkedDrives.find((d) => d.id === data.drive_id);
                  drive = altDrive ?? { ...drive, id: data.drive_id };
                }
              }
            } catch {
              // Proceed with current drive; workspace may fall back to My Private
            }
          }
        }

        // Gallery Media drive: always use a subfolder so files aren't mixed at root.
        // (Per-gallery subfolders come from uploadFilesToGallery on the gallery page.)
        const isGalleryDrive = drive.name === "Gallery Media";
        const pathPrefix = isGalleryDrive ? `uploads_${Date.now()}` : "";

        let bytesSynced = 0;
        const completedBytesRef = { current: 0 };
        const updateFile = (
          id: string,
          update: Partial<FileUploadItem>,
          totalBytes?: number
        ) => {
          setFileUploadProgress((prev) => {
            if (!prev) return null;
            const nextBytes = totalBytes ?? bytesSynced;
            return {
              ...prev,
              files: prev.files.map((f) =>
                f.id === id ? { ...f, ...update } : f
              ),
              bytesSynced: nextBytes,
            };
          });
        };

        const fileById = new Map(filesToUpload.map((f, i) => [fileItems[i].id, f]));
        const manager = new UploadManager({
          getIdToken: () => getCurrentUserIdToken(false),
          getUserId: () => user?.uid ?? null,
          onProgress: (ev) => {
            bytesSynced = completedBytesRef.current + ev.bytesLoaded;
            updateFile(ev.fileId, {
              bytesSynced: ev.bytesLoaded,
              status: ev.status === "completed" ? "completed" : "uploading",
            });
          },
          onComplete: async (ev) => {
            const file = fileById.get(ev.fileId);
            if (!file) return;
            completedBytesRef.current += file.size;
            bytesSynced = completedBytesRef.current;
            const idToken = await getCurrentUserIdToken(false);
            const snapshotRef = await addDoc(collection(db, "backup_snapshots"), {
              linked_drive_id: drive.id,
              userId: user.uid,
              status: "completed",
              files_count: 1,
              bytes_synced: file.size,
              completed_at: new Date(),
            });
            const innerRel = getUploadRelativePath(file, file.name);
            const relPath = pathPrefix ? `${pathPrefix}/${innerRel}` : innerRel;
            const workspaceFields = await getWorkspaceFieldsForOrgDrive(
              drive,
              idToken ?? null,
              user.uid,
              resolvedWorkspaceId ?? selectedWorkspaceId
            );
            const fileRef = await addDoc(collection(db, "backup_files"), {
              backup_snapshot_id: snapshotRef.id,
              linked_drive_id: drive.id,
              userId: user.uid,
              relative_path: relPath,
              object_key: ev.objectKey,
              size_bytes: file.size,
              content_type: file.type || "application/octet-stream",
              modified_at: file.lastModified
                ? new Date(file.lastModified).toISOString()
                : new Date().toISOString(),
              uploaded_at: new Date().toISOString(),
              deleted_at: null,
              lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
              organization_id: drive.organization_id ?? null,
              ...workspaceFields,
              ...personalTeamFileFields(drive),
              ...macosPackageFirestoreFieldsFromRelativePath(relPath),
            });
            options?.onFileComplete?.({
              name: file.name,
              path: `${drive.name}/${relPath}`.replace(/\/+/g, "/"),
              backupFileId: fileRef.id,
              objectKey: ev.objectKey,
            });
            if (idToken) {
              fetch("/api/files/extract-metadata", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  backup_file_id: fileRef.id,
                  object_key: ev.objectKey,
                }),
              }).catch(() => {});
              fetch("/api/packages/link-backup-file", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ backup_file_id: fileRef.id }),
              }).catch(() => {});
            }
            if (VIDEO_EXT.test(file.name) && idToken) {
              fetch("/api/backup/generate-proxy", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ object_key: ev.objectKey, name: file.name, queue: true }),
              }).catch(() => {});
              // Mux: extract-metadata (above) triggers /api/mux/create-asset for videos
            }
            await updateDoc(doc(db, "linked_drives", drive.id), {
              last_synced_at: new Date().toISOString(),
            });
            updateFile(ev.fileId, { status: "completed", bytesSynced: file.size }, bytesSynced);
          },
          onError: (ev) => {
            setFileUploadError(ev.error);
            updateFile(ev.fileId, { status: "error", error: ev.error });
          },
        });
        uploadManagerRef.current = manager;

        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          const item = fileItems[i];
          updateFile(item.id, { status: "uploading" });
          const innerRel = getUploadRelativePath(file, file.name);
          const relPath = pathPrefix ? `${pathPrefix}/${innerRel}` : innerRel;
          const queued: QueuedFile = {
            id: item.id,
            file,
            driveId: drive.id,
            relativePath: relPath,
            workspaceId: resolvedWorkspaceId ?? undefined,
            organizationId: drive.organization_id ?? null,
          };
          try {
            await manager.upload(queued);
          } catch {
            // onError already called for non-abort
          }
        }

        setFileUploadProgress((prev) => {
          if (!prev) return null;
          const completed = prev.files.every(
            (f) =>
              f.status === "completed" ||
              f.status === "cancelled" ||
              f.status === "error"
          );
          return {
            ...prev,
            status: completed ? "completed" : "failed",
            bytesSynced,
          };
        });
        setTimeout(() => {
          setFileUploadProgress(null);
          setStorageVersion((v) => v + 1);
        }, 2000);
        try {
          const token = await getCurrentUserIdToken(false);
          const base = typeof window !== "undefined" ? window.location.origin : "";
          await fetch(`${base}/api/storage/recalculate`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Non-fatal
        }
      } catch (err) {
        setFileUploadProgress(null);
        setFileUploadError(err instanceof Error ? err.message : "Upload failed");
        throw err;
      }
    },
    [user, getOrCreateStorageDrive, linkedDrives, isEnterpriseContext, org?.id, selectedWorkspaceId]
  );

  const uploadFilesToGallery = useCallback(
    async (
      files: File[],
      galleryId: string,
      options?: { onComplete?: () => void; galleryTitle?: string }
    ) => {
      if (!isFirebaseConfigured() || !user) {
        setError("Please sign in to upload.");
        return;
      }
      if (files.length === 0) return;
      setError(null);
      setFileUploadError(null);
      setStorageQuotaExceeded(null);

      const bytesTotal = files.reduce((s, f) => s + f.size, 0);
      const fileItems = files.map((f, i) => ({
        id: `gallery-upload-${Date.now()}-${i}-${f.name}`,
        name: f.name,
        size: f.size,
        bytesSynced: 0,
        status: "pending" as const,
      }));

      setFileUploadProgress({
        status: "in_progress",
        files: fileItems,
        bytesTotal,
        bytesSynced: 0,
      });

      try {
        const tok = await getCurrentUserIdToken(false);
        const contextParam = isEnterpriseContext ? "?context=enterprise" : "?context=personal";
        const res = await fetch(
          typeof window !== "undefined"
            ? `${window.location.origin}/api/storage/status${contextParam}`
            : "",
          {
            headers: {
              Authorization: `Bearer ${tok}`,
            },
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            effective_billable_bytes_for_enforcement?: number;
            billable_used_bytes?: number;
            quota_bytes: number | null;
            is_organization_user?: boolean;
            _deprecated?: {
              storage_used_total_for_quota?: number;
              storage_quota_bytes?: number | null;
            };
          };
          const quota =
            data.quota_bytes ?? data._deprecated?.storage_quota_bytes ?? null;
          const usedForQuota =
            data.effective_billable_bytes_for_enforcement ??
            data._deprecated?.storage_used_total_for_quota ??
            data.billable_used_bytes ??
            0;
          if (quota !== null && usedForQuota + bytesTotal > quota) {
            setFileUploadProgress(null);
            setStorageQuotaExceeded({
              attemptedBytes: bytesTotal,
              usedBytes: usedForQuota,
              quotaBytes: quota,
              isOrganizationUser: !!data.is_organization_user,
            });
            return;
          }
        }
      } catch {
        // Non-fatal
      }

      const drive = await getOrCreateGalleryDrive();
      const db = getFirebaseFirestore();
      const usedNames = new Map<string, number>();
      const uniqueNames = files.map((f) => {
        let finalName = f.name;
        const base = f.name.replace(/\.([^.]+)$/, "");
        const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : "";
        let n = usedNames.get(f.name) ?? 0;
        if (n > 0) finalName = `${base} (${n})${ext}`;
        usedNames.set(f.name, n + 1);
        return finalName;
      });
      let bytesSynced = 0;
      const completedBytesRef = { current: 0 };
      const base = typeof window !== "undefined" ? window.location.origin : "";

      const updateFile = (
        id: string,
        update: Partial<FileUploadItem>,
        totalBytes?: number
      ) => {
        setFileUploadProgress((prev) => {
          if (!prev) return null;
          const nextBytes = totalBytes ?? bytesSynced;
          return {
            ...prev,
            files: prev.files.map((f) => (f.id === id ? { ...f, ...update } : f)),
            bytesSynced: nextBytes,
          };
        });
      };

      const fileById = new Map(files.map((f, i) => [fileItems[i].id, f]));
      const manager = new UploadManager({
        getIdToken: () => getCurrentUserIdToken(false),
        getUserId: () => user?.uid ?? null,
        onProgress: (ev) => {
          bytesSynced = completedBytesRef.current + ev.bytesLoaded;
          updateFile(ev.fileId, {
            bytesSynced: ev.bytesLoaded,
            status: ev.status === "completed" ? "completed" : "uploading",
          });
        },
        onComplete: async (ev) => {
          const file = fileById.get(ev.fileId);
          if (!file) return;
          completedBytesRef.current += file.size;
          bytesSynced = completedBytesRef.current;
          const snapshotRef = await addDoc(collection(db, "backup_snapshots"), {
            linked_drive_id: drive.id,
            userId: user.uid,
            status: "completed",
            files_count: 1,
            bytes_synced: file.size,
            completed_at: new Date(),
          });
          const fileIndex = fileItems.findIndex((it) => it.id === ev.fileId);
          const safeName = uniqueNames[fileIndex] ?? file.name;
          const relativePath = `${galleryId}/${safeName}`;
          const token = await getCurrentUserIdToken(false);
          const workspaceFields = await getWorkspaceFieldsForOrgDrive(
            drive,
            token ?? null,
            user.uid,
            selectedWorkspaceId
          );
          const fileRef = await addDoc(collection(db, "backup_files"), {
            backup_snapshot_id: snapshotRef.id,
            linked_drive_id: drive.id,
            userId: user.uid,
            relative_path: relativePath,
            object_key: ev.objectKey,
            size_bytes: file.size,
            content_type: file.type || "application/octet-stream",
            modified_at: file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString(),
            uploaded_at: new Date().toISOString(),
            deleted_at: null,
            lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
            organization_id: drive.organization_id ?? null,
            gallery_id: galleryId,
            ...workspaceFields,
            ...personalTeamFileFields(drive),
            ...macosPackageFirestoreFieldsFromRelativePath(relativePath),
          });
          getCurrentUserIdToken(false)
            .then((token) =>
              token
                ? fetch("/api/files/extract-metadata", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      backup_file_id: fileRef.id,
                      object_key: ev.objectKey,
                    }),
                  }).catch(() => {})
                : Promise.resolve()
            );
          getCurrentUserIdToken(false)
            .then((token) =>
              token
                ? fetch("/api/packages/link-backup-file", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ backup_file_id: fileRef.id }),
                  }).catch(() => {})
                : Promise.resolve()
            );
          updateFile(ev.fileId, { status: "completed", bytesSynced: file.size }, bytesSynced);
          getCurrentUserIdToken(false)
            .then((token) =>
              fetch(`${base}/api/galleries/${galleryId}/assets`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  backup_file_ids: [fileRef.id],
                  asset_origin: "gallery_storage",
                }),
              })
            )
            .catch((err) => console.error("Add gallery asset failed:", err));
        },
        onError: (ev) => {
          setFileUploadError(ev.error);
          updateFile(ev.fileId, { status: "error", error: ev.error } as Partial<FileUploadItem>);
        },
      });
      uploadManagerRef.current = manager;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const item = fileItems[i];
        updateFile(item.id, { status: "uploading" });
        const queued: QueuedFile = {
          id: item.id,
          file,
          driveId: drive.id,
          relativePath: `${galleryId}/${uniqueNames[i]}`,
          workspaceId: undefined,
          organizationId: null,
        };
        try {
          await manager.upload(queued);
        } catch {
          // onError already called
        }
      }

      setFileUploadProgress((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: "completed",
          bytesSynced,
        };
      });

      setTimeout(() => {
        setFileUploadProgress(null);
        setStorageVersion((v) => v + 1);
        options?.onComplete?.();
      }, 2000);

      try {
        const token = await getCurrentUserIdToken(false);
        const base = typeof window !== "undefined" ? window.location.origin : "";
        await fetch(`${base}/api/storage/recalculate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Non-fatal
      }
    },
    [user, getOrCreateGalleryDrive, selectedWorkspaceId, isEnterpriseContext]
  );

  const uploadSingleFile = useCallback(
    async (file: File, targetDriveId?: string) => {
      await uploadFiles([file], targetDriveId);
    },
    [uploadFiles]
  );


  const clearFileUploadError = useCallback(() => setFileUploadError(null), []);

  const bumpStorageVersion = useCallback(
    () => setStorageVersion((v) => v + 1),
    []
  );


  const value = useMemo<BackupContextValue>(
    () => ({
      linkedDrives,
      loading,
      error,
      fileUploadError,
      storageVersion,
      bumpStorageVersion,
      fetchDrives,
      linkDrive,
      pickDirectory,
      unlinkDrive,
      uploadSingleFile,
      uploadFiles,
      cancelFileUpload,
      fileUploadProgress,
      clearFileUploadError,
      fsAccessSupported,
      createFolder,
      getOrCreateStorageDrive,
      getOrCreateCreatorRawDrive,
      getOrCreateGalleryDrive,
      creatorRawDriveId,
      uploadFilesToGallery,
    }),
    [
      linkedDrives,
      loading,
      error,
      storageVersion,
      bumpStorageVersion,
      fetchDrives,
      linkDrive,
      pickDirectory,
      unlinkDrive,
      uploadSingleFile,
      uploadFiles,
      cancelFileUpload,
      fileUploadProgress,
      clearFileUploadError,
      fileUploadError,
      fsAccessSupported,
      createFolder,
      getOrCreateStorageDrive,
      getOrCreateCreatorRawDrive,
      getOrCreateGalleryDrive,
      creatorRawDriveId,
      uploadFilesToGallery,
    ]
  );

  return (
    <BackupContext.Provider value={value}>
      {children}
      {storageQuotaExceeded && (
        <StorageQuotaExceededModal
          open
          onClose={() => setStorageQuotaExceeded(null)}
          attemptedBytes={storageQuotaExceeded.attemptedBytes}
          usedBytes={storageQuotaExceeded.usedBytes}
          quotaBytes={storageQuotaExceeded.quotaBytes}
          isOrganizationUser={storageQuotaExceeded.isOrganizationUser}
          storage_denial={storageQuotaExceeded.storage_denial}
        />
      )}
    </BackupContext.Provider>
  );
}

export function useBackup() {
  const ctx = useContext(BackupContext);
  if (!ctx) throw new Error("useBackup must be used within BackupProvider");
  return ctx;
}
