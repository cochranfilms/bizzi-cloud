"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getAuthToken } from "@/lib/auth-token";
import {
  attachUppyLocalPreview,
  getUploadRelativePath,
  revokeAllUppyPreviewsFromUppy,
  revokeUppyPreview,
} from "@/lib/uppy-local-preview";
import { runChunkedIngest } from "@/lib/uppy-chunked-ingest";
import {
  getAggregateProgressThrottleMs,
  getBatchTierFromCount,
  getGalleryProgressMinIntervalMs,
  maxBatchTier,
  type BatchTier,
} from "@/lib/uppy-mass-upload-constants";
import { createMassUploadDebug } from "@/lib/uppy-mass-upload-debug";
import {
  flatMacosPackageUserMessage,
  isLikelyFlatMacosPackageBrowserUpload,
} from "@/lib/macos-package-bundles";
import { shouldUseUppyS3Multipart } from "@/lib/uppy-multipart-policy";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import UppyUploadPanelExpanded from "./UppyUploadPanelExpanded";
import { enqueuePresignedComplete } from "@/lib/presigned-complete-queue";
import { collectFilesFromDataTransfer } from "@/lib/browser-data-transfer-files";
import { creatorRawClientAllowsUploadAttempt } from "@/lib/creator-raw-upload-policy";
import { CREATOR_RAW_REJECTION_MESSAGES } from "@/lib/creator-raw-media-config";
import { useTheme } from "@/context/ThemeContext";
import { useUppyBizziThemeVariables } from "@/hooks/useUppyBizziTheme";
import type { GalleryManageUploadLifecycleEvent } from "@/lib/gallery-manage-upload-lifecycle";
import { Upload, ChevronUp, ChevronDown, X, Loader2, Check } from "lucide-react";
import "@/styles/uppy-bizzi-theme.css";
import "@/styles/uppy-bizzi-premium.css";

/** Uppy AwsS3 uses Promise.allSettled: when one file fails, others continue.
 * We track failed files and surface them so users can retry from the Dashboard. */

import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Presigned PUTs only sign host + x-amz-server-side-encryption. XMLHttpRequest sets
 * Content-Type automatically for Blob/File when blob.type is non-empty (e.g. FCP
 * bundles Safari/Chrome represent as zip-backed types). Unsigned Content-Type breaks
 * SigV4 → B2 returns 403; Chrome surfaces as net::ERR_ACCESS_DENIED.
 */
async function uploadPartBytesCompat(
  args: Parameters<typeof AwsS3.uploadPartBytes>[0]
): ReturnType<typeof AwsS3.uploadPartBytes> {
  const { body, size } = args;
  // Empty `type` keeps XMLHttpRequest from attaching an unsigned Content-Type (see comment above).
  if (body instanceof Blob && body.type !== "") {
    const buffer = await body.arrayBuffer();
    const bodyNeutral = new Blob([buffer], { type: "" });
    return AwsS3.uploadPartBytes({
      ...args,
      body: bodyNeutral,
      size: size ?? bodyNeutral.size,
    });
  }
  return AwsS3.uploadPartBytes(args);
}

/** Uppy Dashboard uses @uppy/utils getDroppedFiles(), which can miss files when items.length < files.length (Chrome). */
const dashboardOriginalHandleDrop = new WeakMap<object, (event: DragEvent) => Promise<void>>();

/** Guarded fallback: stock browse / internal paths that still call `addFiles`. */
const dashboardOriginalAddFiles = new WeakMap<object, (files: File[]) => void>();

type IngestPhase = "idle" | "queued" | "adding";

function resumeUploadIfNeeded(uppy: Uppy): void {
  const { currentUploads, files } = uppy.getState();
  if (Object.keys(currentUploads).length > 0) {
    uppy.upload().catch(() => {});
    return;
  }
  const anyInFlight = Object.values(files).some(
    (f) =>
      f.progress?.uploadStarted != null &&
      !f.progress?.uploadComplete &&
      !f.error
  );
  if (anyInFlight) {
    uppy.upload().catch(() => {});
  }
}

interface UppyUploadModalProps {
  open: boolean;
  onClose: () => void;
  driveId: string;
  pathPrefix?: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  scopeLabel?: string | null;
  driveName?: string | null;
  galleryId?: string | null;
  uploadIntent?: string | null;
  lockedDestination?: boolean;
  sourceSurface?: string | null;
  destinationMode?: string | null;
  routeContext?: string | null;
  targetDriveName?: string | null;
  resolvedBy?: string | null;
  pendingFiles: File[];
  onPendingFilesConsumed: () => void;
  onUploadComplete?: () => void;
  /** Debounced per-file refresh for gallery asset grids (see UppyUploadContext). */
  onGalleryAssetUploaded?: () => void | Promise<void>;
  onGalleryManageUploadLifecycle?: (event: GalleryManageUploadLifecycleEvent) => void;
}

export default function UppyUploadModal({
  open,
  onClose,
  driveId,
  pathPrefix = "",
  workspaceId = null,
  workspaceName = null,
  scopeLabel = null,
  driveName = null,
  galleryId = null,
  uploadIntent = null,
  lockedDestination = false,
  sourceSurface = null,
  destinationMode = null,
  routeContext = null,
  targetDriveName = null,
  resolvedBy = null,
  pendingFiles,
  onPendingFilesConsumed,
  onUploadComplete,
  onGalleryAssetUploaded,
  onGalleryManageUploadLifecycle,
}: UppyUploadModalProps) {
  const { theme: appTheme } = useTheme();
  const uppyChromeVars = useUppyBizziThemeVariables();
  const uppyDataTheme = appTheme === "dark" ? "dark" : "light";

  const uppyRef = useRef<Uppy | null>(null);
  const onUploadCompleteRef = useRef(onUploadComplete);
  onUploadCompleteRef.current = onUploadComplete;
  const onGalleryAssetUploadedRef = useRef(onGalleryAssetUploaded);
  onGalleryAssetUploadedRef.current = onGalleryAssetUploaded;
  const galleryAssetDebouncedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onGalleryManageUploadLifecycleRef = useRef(onGalleryManageUploadLifecycle);
  onGalleryManageUploadLifecycleRef.current = onGalleryManageUploadLifecycle;

  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [dashboardHeight, setDashboardHeight] = useState(300);
  const [progress, setProgress] = useState({
    bytesUploaded: 0,
    bytesTotal: 0,
    fileCount: 0,
    uploadingCount: 0,
    completedCount: 0,
    failedCount: 0,
    allComplete: false,
  });
  const [macosPackageWarning, setMacosPackageWarning] = useState<string | null>(null);
  const [ingestPhase, setIngestPhase] = useState<IngestPhase>("idle");
  const [ingestAdded, setIngestAdded] = useState(0);
  const [ingestTotal, setIngestTotal] = useState(0);
  /** Peak tier this modal session — drives virtual grid progress throttle. */
  const [sessionGridTier, setSessionGridTier] = useState<BatchTier>("normal");

  const previewPolicyRef = useRef<BatchTier>("normal");
  const sessionGridTierRef = useRef<BatchTier>("normal");
  const ingestAbortRef = useRef<AbortController | null>(null);
  const runChunkedAddRef = useRef<(files: File[]) => Promise<void>>(async () => {});
  const ingestChainRef = useRef(Promise.resolve());
  const galleryProgressLastRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    sessionGridTierRef.current = sessionGridTier;
  }, [sessionGridTier]);

  useEffect(() => {
    if (!open) setMacosPackageWarning(null);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setIngestPhase("idle");
      setIngestAdded(0);
      setIngestTotal(0);
      setSessionGridTier("normal");
      previewPolicyRef.current = "normal";
      ingestAbortRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const narrow = window.matchMedia("(max-width: 639px)").matches;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const target = narrow
        ? Math.max(180, Math.min(320, Math.round(vh * 0.36)))
        : Math.max(280, Math.min(440, Math.round(vh * 0.42)));
      setDashboardHeight(target);
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    const getAuthHeaders = async () => {
      // Cached token only — forcing refresh per batch hammered securetoken.googleapis.com during
      // .fcpbundle-style uploads (thousands of small files), causing 429/400 and upload failures.
      const token = await getAuthToken(false);
      return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const creatorRawLocked =
      destinationMode === "creator_raw" && lockedDestination === true;

    const uppyRefLocal = { current: null as Uppy | null };

    const uppy = new Uppy({
      id: "uppy-upload",
      autoProceed: false,
      allowMultipleUploadBatches: true,
      /** No MIME/extension gate — macOS packages (.lrlibrary, .fcpbundle) must not be blocked here. */
      restrictions: {
        allowedFileTypes: null,
        maxFileSize: null,
        minFileSize: null,
        maxNumberOfFiles: null,
      },
      // Uppy default ids use leaf name + size + mtime, not path. FCP bundles repeat names like
      // "Frame 0 - 1023" / AppleDouble "._…" across many folders with identical size/mtime → false "duplicate" errors.
      onBeforeFileAdded: (file) => {
        const leaf =
          file.name ||
          (file.data instanceof File ? file.data.name : "") ||
          "";
        if (creatorRawLocked && leaf) {
          const fd = file.data instanceof File ? file.data : null;
          if (fd && isLikelyFlatMacosPackageBrowserUpload(fd)) {
            // Removed in file-added with warning; do not gate here.
          } else if (!creatorRawClientAllowsUploadAttempt(leaf)) {
            queueMicrotask(() => {
              uppyRefLocal.current?.info(
                {
                  message: CREATOR_RAW_REJECTION_MESSAGES.nonMediaLeaf,
                  details: "non_media_leaf",
                },
                "error",
                5000
              );
            });
            return false;
          }
        }
        const data = file.data;
        if (data instanceof File) {
          const wr =
            data.webkitRelativePath?.trim() ||
            (data as File & { relativePath?: string }).relativePath?.trim();
          if (wr) {
            return { ...file, id: `uppy-upload:${wr}` } as typeof file;
          }
        }
        return undefined;
      },
    });

    const awsS3Opts = {
      id: "AwsS3",
      endpoint: typeof window !== "undefined" ? `${window.location.origin}/api/uppy` : "",
      headers: {} as Record<string, string>,
      /** Lower than default 6 to reduce concurrent B2/S3 sockets during huge .fcpbundle uploads */
      limit: 3,
      shouldUseMultipart: shouldUseUppyS3Multipart,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadPartBytes: uploadPartBytesCompat,
    };
    uppy.use(AwsS3, awsS3Opts);
    uppyRefLocal.current = uppy;

    uppy.addPreProcessor(async () => {
      const plugin = uppy.getPlugin("AwsS3");
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        throw new Error("You must be signed in to upload files.");
      }
      plugin?.setOptions({ headers });
    });

    const massDebug = createMassUploadDebug();
    const usedNames = new Map<string, number>();

    let lastAggFlush = 0;
    let aggTimeout: ReturnType<typeof setTimeout> | null = null;
    const flushProgress = () => {
      massDebug?.progressPing();
      lastAggFlush = Date.now();
      const files = uppy.getFiles();
      const bytesTotal = files.reduce((s, f) => s + (f.size ?? 0), 0);
      let bytesUploaded = 0;
      let completedCount = 0;
      let uploadingCount = 0;
      let failedCount = 0;
      for (const f of files) {
        if (f.error) {
          failedCount++;
          continue;
        }
        const size = f.size ?? 0;
        const up = Number(f.progress?.bytesUploaded ?? 0);
        const done =
          f.progress?.uploadComplete === true ||
          (size > 0 && up >= size) ||
          uppy.getState().totalProgress === 100;
        bytesUploaded += done ? size : up;
        if (done) completedCount++;
        else if (up > 0) uploadingCount++;
      }
      if (bytesTotal > 0 && bytesUploaded > bytesTotal) bytesUploaded = bytesTotal;
      const allComplete =
        files.length > 0 &&
        (completedCount + failedCount === files.length || uppy.getState().totalProgress === 100);

      setProgress({
        bytesUploaded,
        bytesTotal,
        fileCount: files.length,
        uploadingCount,
        completedCount,
        failedCount,
        allComplete,
      });
    };

    const scheduleProgress = () => {
      const ms = getAggregateProgressThrottleMs(sessionGridTierRef.current);
      const now = Date.now();
      if (now - lastAggFlush >= ms) {
        flushProgress();
        return;
      }
      if (aggTimeout != null) return;
      aggTimeout = setTimeout(() => {
        aggTimeout = null;
        flushProgress();
      }, Math.max(16, ms - (now - lastAggFlush)));
    };

    runChunkedAddRef.current = async (incoming: File[]) => {
      if (incoming.length === 0) return;
      const prev = ingestChainRef.current;
      const task = async () => {
        await prev;
        const tier = getBatchTierFromCount(incoming.length);
        previewPolicyRef.current = tier;
        setSessionGridTier((p) => maxBatchTier(p, tier));
        massDebug?.log("ingest_start", { count: incoming.length, tier });
        setIngestPhase("queued");
        setIngestTotal(incoming.length);
        setIngestAdded(0);
        queueMicrotask(() => setIngestPhase("adding"));
        const ac = new AbortController();
        ingestAbortRef.current = ac;
        const toDescriptors = (slice: File[]) =>
          slice.map((f) => {
            const rel = f.webkitRelativePath?.trim() || "";
            return { name: rel || f.name, data: f };
          });
        await runChunkedIngest({
          uppy,
          files: incoming,
          toDescriptors,
          batchTier: tier,
          signal: ac.signal,
          debug: massDebug,
          onProgress: (a, t) => {
            setIngestAdded(a);
            setIngestTotal(t);
          },
        });
        setIngestPhase("idle");
        setIngestTotal(0);
        setIngestAdded(0);
        previewPolicyRef.current = "normal";
        ingestAbortRef.current = null;
        flushProgress();
        queueMicrotask(() => resumeUploadIfNeeded(uppy));
      };
      ingestChainRef.current = task().catch(() => {});
      await ingestChainRef.current;
    };

    uppy.on("file-added", (file) => {
      const fileData = file.data instanceof File ? file.data : null;
      if (fileData && isLikelyFlatMacosPackageBrowserUpload(fileData)) {
        queueMicrotask(() => {
          uppy.removeFile(file.id);
          setMacosPackageWarning(flatMacosPackageUserMessage(fileData.name));
        });
        return;
      }
      const webkitRel = fileData ? getUploadRelativePath(fileData, file.name) : file.name;
      const pkgFields = macosPackageFirestoreFieldsFromRelativePath(webkitRel);
      const isMacosPackageMember = Boolean(
        pkgFields.macos_package_kind && pkgFields.macos_package_root_relative_path
      );

      let uniqueName = webkitRel;
      if (pathPrefix && galleryId) {
        const key = webkitRel;
        const n = usedNames.get(key) ?? 0;
        usedNames.set(key, n + 1);
        if (n > 0) {
          const segments = webkitRel.split("/");
          const leaf = segments.pop() ?? file.name;
          const base = leaf.replace(/\.([^.]+)$/, "");
          const ext = leaf.includes(".") ? leaf.slice(leaf.lastIndexOf(".")) : "";
          const renamedLeaf = `${base} (${n})${ext}`;
          uniqueName = [...segments, renamedLeaf].filter(Boolean).join("/");
        }
      }
      const relPath = pathPrefix ? `${pathPrefix}/${uniqueName}` : uniqueName;
      uppy.setFileState(file.id, {
        meta: {
          ...file.meta,
          driveId,
          relativePath: relPath,
          sizeBytes: file.size ?? 0,
          workspaceId: workspaceId ?? undefined,
          galleryId: galleryId ?? undefined,
          uploadIntent: uploadIntent ?? "",
          lockedDestination: lockedDestination ? "true" : "false",
          sourceSurface: sourceSurface ?? "",
          destinationMode: destinationMode ?? "",
          routeContext: routeContext ?? "",
          targetDriveName: targetDriveName ?? driveName ?? "",
          resolvedBy: resolvedBy ?? "",
          lastModified:
            (file.data instanceof File ? file.data.lastModified : null) ??
            (file as { lastModified?: number }).lastModified ??
            null,
          ...(isMacosPackageMember && pkgFields.macos_package_root_relative_path
            ? {
                macosPackageGroupRoot: pkgFields.macos_package_root_relative_path,
                macosPackageKind: pkgFields.macos_package_kind,
              }
            : {}),
        },
      });
      if (fileData && !isMacosPackageMember) {
        const tier = previewPolicyRef.current;
        const mode =
          tier === "extreme" ? "skip" : tier === "large" ? "idle" : "eager";
        void attachUppyLocalPreview(
          (preview) => {
            uppy.setFileState(file.id, { preview });
          },
          fileData,
          { mode }
        );
      }
      queueMicrotask(() => resumeUploadIfNeeded(uppy));
      if (galleryId) {
        onGalleryManageUploadLifecycleRef.current?.({
          type: "file_added",
          clientId: file.id,
          name: file.name ?? uniqueName,
          size: file.size ?? 0,
        });
      }
    });

    uppy.on("file-removed", (removed) => {
      revokeUppyPreview(removed.preview);
    });

    uppy.on("upload-progress", (file, progress) => {
      scheduleProgress();
      if (galleryId && file && progress) {
        const minI = getGalleryProgressMinIntervalMs(sessionGridTierRef.current);
        const now = Date.now();
        const map = galleryProgressLastRef.current;
        const last = map.get(file.id) ?? 0;
        if (now - last < minI) return;
        map.set(file.id, now);
        const bytesUploaded = Number((progress as { bytesUploaded?: number }).bytesUploaded ?? 0);
        const bytesTotal = Number(
          (progress as { bytesTotal?: number }).bytesTotal ?? file.size ?? 0
        );
        onGalleryManageUploadLifecycleRef.current?.({
          type: "upload_progress",
          clientId: file.id,
          bytesUploaded,
          bytesTotal,
        });
      }
    });
    uppy.on("upload-error", (file, error) => {
      flushProgress();
      if (galleryId && file) {
        onGalleryManageUploadLifecycleRef.current?.({
          type: "upload_error",
          clientId: file.id,
          message: error?.message ?? "Upload failed",
        });
      }
    });

    const scheduleGalleryAssetListRefresh = () => {
      if (!galleryId) return;
      const cb = onGalleryAssetUploadedRef.current;
      if (!cb) return;
      if (galleryAssetDebouncedTimerRef.current) {
        clearTimeout(galleryAssetDebouncedTimerRef.current);
      }
      galleryAssetDebouncedTimerRef.current = setTimeout(() => {
        galleryAssetDebouncedTimerRef.current = null;
        void cb();
      }, 450);
    };

    uppy.on("upload-success", async (file) => {
      if (!file) return;
      const size = file.size ?? 0;
      if (
        size > 0 &&
        size <= 5 * 1024 * 1024 &&
        !shouldUseUppyS3Multipart({ size, meta: file.meta ?? {} })
      ) {
        const meta = file.meta ?? {};
        const metaDriveId = meta.driveId ?? meta.drive_id;
        const relativePath = meta.relativePath ?? meta.relative_path ?? file.name ?? "";
        const sizeBytes = meta.sizeBytes ?? meta.size_bytes ?? size;
        const contentType = file.type ?? meta.contentType ?? "application/octet-stream";
        const lastModified =
          (file.data instanceof File ? file.data.lastModified : null) ??
          meta.lastModified ??
          null;
        if (metaDriveId && relativePath && sizeBytes) {
          await enqueuePresignedComplete(async () => {
            let data: { error?: string } = {};
            try {
              const token = await getAuthToken(false);
              if (!token) {
                const msg = "Sign in again to finish saving this upload to your library.";
                uppy.setFileState(file.id, { error: msg });
                uppy.info({ message: msg, details: file.name }, "error", 12_000);
                flushProgress();
                if (galleryId && (meta.galleryId ?? meta.gallery_id)) {
                  onGalleryManageUploadLifecycleRef.current?.({
                    type: "upload_error",
                    clientId: file.id,
                    message: msg,
                  });
                }
                return;
              }
              const res = await fetch(
                `${typeof window !== "undefined" ? window.location.origin : ""}/api/uppy/presigned-complete`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    driveId: metaDriveId,
                    relativePath,
                    sizeBytes: Number(sizeBytes),
                    contentType,
                    lastModified: lastModified != null ? Number(lastModified) : null,
                    workspaceId: meta.workspaceId ?? null,
                    galleryId: meta.galleryId ?? null,
                    reservation_id: meta.reservation_id ?? meta.reservationId ?? null,
                    reservationId: meta.reservationId ?? meta.reservation_id ?? null,
                    uploadIntent: meta.uploadIntent ?? null,
                    lockedDestination: meta.lockedDestination ?? null,
                    destinationMode: meta.destinationMode ?? null,
                    routeContext: meta.routeContext ?? null,
                    sourceSurface: meta.sourceSurface ?? null,
                    targetDriveName: meta.targetDriveName ?? null,
                    resolvedBy: meta.resolvedBy ?? null,
                  }),
                }
              );
              try {
                data = (await res.json()) as { error?: string };
              } catch {
                /* non-JSON body */
              }
              if (!res.ok) {
                const msg =
                  typeof data.error === "string" && data.error.trim()
                    ? data.error.trim()
                    : "Upload could not be finalized. The file may still be in storage; try again or contact support.";
                const cur = uppy.getFile(file.id);
                const p = cur?.progress;
                const uploadOk =
                  p != null &&
                  p.uploadStarted != null &&
                  typeof p.bytesUploaded === "number";
                uppy.setFileState(file.id, {
                  error: msg,
                  progress: uploadOk
                    ? { ...p, uploadComplete: false }
                    : {
                        uploadStarted: Date.now(),
                        bytesUploaded: size,
                        bytesTotal: size,
                        uploadComplete: false,
                        percentage: 100,
                      },
                });
                uppy.info({ message: msg, details: file.name }, "error", 16_000);
                flushProgress();
                if (galleryId && (meta.galleryId ?? meta.gallery_id)) {
                  onGalleryManageUploadLifecycleRef.current?.({
                    type: "upload_error",
                    clientId: file.id,
                    message: msg,
                  });
                }
              }
            } catch {
              const msg =
                "Could not reach the server to finish saving your upload. Check your connection and try again.";
              uppy.setFileState(file.id, { error: msg });
              uppy.info({ message: msg, details: file.name }, "error", 12_000);
              flushProgress();
              const meta = file.meta ?? {};
              if (galleryId && (meta.galleryId ?? meta.gallery_id)) {
                onGalleryManageUploadLifecycleRef.current?.({
                  type: "upload_error",
                  clientId: file.id,
                  message: msg,
                });
              }
            }
          });
        }
      }
      flushProgress();
      // Intentionally do NOT call onUploadComplete here: it bumps storageVersion and
      // refetches dashboard data. Per-file callbacks during large folder uploads (e.g.
      // .fcpbundle) cause thousands of concurrent API requests and ERR_INSUFFICIENT_RESOURCES.
      // Gallery uploads use a separate debounced callback (no storage bump) so the asset grid
      // can update as each file finishes instead of waiting for the full Uppy "complete" event.
      {
        const cur = uppy.getFile(file.id);
        const meta = file.meta ?? {};
        if (
          galleryId &&
          (meta.galleryId ?? meta.gallery_id) &&
          !cur?.error
        ) {
          onGalleryManageUploadLifecycleRef.current?.({
            type: "upload_processing",
            clientId: file.id,
          });
          scheduleGalleryAssetListRefresh();
        }
      }
    });
    uppy.on("complete", () => {
      flushProgress();
      onUploadCompleteRef.current?.();
    });

    uppyRef.current = uppy;
    setReady(true);

    return () => {
      if (galleryAssetDebouncedTimerRef.current) {
        clearTimeout(galleryAssetDebouncedTimerRef.current);
        galleryAssetDebouncedTimerRef.current = null;
      }
      if (aggTimeout != null) {
        clearTimeout(aggTimeout);
        aggTimeout = null;
      }
      massDebug?.resetProgressMeter();
      revokeAllUppyPreviewsFromUppy(uppy);
      uppy.cancelAll();
      uppy.destroy();
      uppyRef.current = null;
      setReady(false);
    };
  }, [
    open,
    driveId,
    pathPrefix,
    workspaceId,
    galleryId,
    uploadIntent,
    lockedDestination,
    sourceSurface,
    destinationMode,
    routeContext,
    targetDriveName,
    resolvedBy,
    driveName,
  ]);

  useLayoutEffect(() => {
    if (!open || !ready || !uppyRef.current) return;
    const uppy = uppyRef.current;
    const plugin = uppy.getPlugin("Dashboard") as
      | {
          handleDrop: (event: DragEvent) => Promise<void>;
          setPluginState: (s: { isDraggingOver?: boolean }) => void;
          opts: { onDrop?: (event: DragEvent) => void };
          addFiles: (files: File[]) => void;
        }
      | undefined;
    if (!plugin) return;

    if (!dashboardOriginalHandleDrop.has(plugin)) {
      const original = plugin.handleDrop.bind(plugin);
      dashboardOriginalHandleDrop.set(plugin, original);

      plugin.handleDrop = async (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        plugin.setPluginState({ isDraggingOver: false });
        uppy.iteratePlugins((p) => {
          if (p.type === "acquirer") {
            (p as { handleRootDrop?: (e: DragEvent) => void }).handleRootDrop?.(event);
          }
        });
        setIngestPhase("queued");
        setIngestTotal(0);
        setIngestAdded(0);
        uppy.log("[Dashboard] Processing dropped files");
        const files = await collectFilesFromDataTransfer(event.dataTransfer);
        if (files.length > 0) {
          uppy.log("[Dashboard] Files dropped");
          await runChunkedAddRef.current(files);
        } else {
          setIngestPhase("idle");
        }
        plugin.opts.onDrop?.(event);
      };
    }

    /** Guarded fallback if a future Uppy build bypasses our custom browse UI. */
    if (!dashboardOriginalAddFiles.has(plugin) && typeof plugin.addFiles === "function") {
      const origAdd = plugin.addFiles.bind(plugin);
      dashboardOriginalAddFiles.set(plugin, origAdd);
      plugin.addFiles = (files: File[]) => {
        try {
          if (Array.isArray(files) && files.length > 0) {
            void runChunkedAddRef.current(files);
            return;
          }
        } catch {
          /* fall through */
        }
        origAdd(files);
      };
    }

    (plugin as { setPluginState: (patch: Record<string, unknown>) => void }).setPluginState({
      bizziFullDropList: 1,
    });

    return () => {
      const dash = uppyRef.current?.getPlugin("Dashboard") as typeof plugin | undefined;
      const origDrop = dash ? dashboardOriginalHandleDrop.get(dash) : undefined;
      if (dash && origDrop) {
        dash.handleDrop = origDrop;
        dashboardOriginalHandleDrop.delete(dash);
      }
      const origAdd = dash ? dashboardOriginalAddFiles.get(dash) : undefined;
      if (dash && origAdd) {
        dash.addFiles = origAdd;
        dashboardOriginalAddFiles.delete(dash);
      }
    };
  }, [open, ready]);

  const consumePending = useCallback(() => {
    onPendingFilesConsumed();
  }, [onPendingFilesConsumed]);

  useEffect(() => {
    if (!open || !ready || !uppyRef.current || pendingFiles.length === 0) return;
    const batch = [...pendingFiles];
    consumePending();
    setExpanded(true);
    void runChunkedAddRef.current(batch);
  }, [open, ready, pendingFiles, consumePending]);

  const handlePanelClose = useCallback(() => {
    ingestAbortRef.current?.abort();
    if (uppyRef.current) revokeAllUppyPreviewsFromUppy(uppyRef.current);
    onClose();
  }, [onClose]);

  if (!open) return null;

  const batchUiHint = sessionGridTier === "normal" ? null : sessionGridTier;

  const { bytesUploaded, bytesTotal, fileCount, uploadingCount, completedCount, failedCount, allComplete } =
    progress;
  const pct = bytesTotal > 0 ? Math.min(100, (bytesUploaded / bytesTotal) * 100) : 0;
  const hasFiles = fileCount > 0;
  const hasFailures = failedCount > 0;
  const headerLabel = allComplete
    ? hasFailures
      ? failedCount === fileCount
        ? "All uploads failed"
        : `${completedCount} succeeded, ${failedCount} failed`
      : "Upload complete"
    : uploadingCount === 0 && completedCount === 0 && !hasFailures
      ? "Add files"
      : uploadingCount > 0
        ? `${uploadingCount} uploading`
        : completedCount + failedCount < fileCount
          ? "Starting…"
          : hasFailures
            ? `${completedCount} succeeded, ${failedCount} failed`
            : "Upload complete";

  /**
   * z-[110]: above dashboard TopNavbar/DesktopTopNavbar (z-[60]) and typical sheets; with GlobalDropZone (z-[100]) DOM order still favors this node after mount.
   * max-height: reserve ~7.5rem for sticky workspace nav + gap so the sheet never grows under/clipped by the chrome; safe areas for notched devices.
   * Portal: avoids clipping from any ancestor overflow/transform while staying fixed to the viewport.
   */
  const shell = (
    <div
      className="bizzi-uppy-theme bizzi-upload-panel-shell fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-[110] flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-7.5rem))] w-[min(48rem,calc(100vw-env(safe-area-inset-left)-env(safe-area-inset-right)-1rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border sm:left-4 sm:w-full sm:max-w-3xl sm:translate-x-0"
      style={{
        ...(uppyChromeVars as CSSProperties),
        backgroundColor: "var(--bizzi-upload-workspace-bg)",
      }}
      data-uppy-theme={uppyDataTheme}
      role="status"
      aria-live="polite"
      aria-label="Upload panel"
    >
      {/* Collapsible header - always visible */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="bizzi-upload-panel-header flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-[background-color] duration-200"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              allComplete && hasFiles ? "border-emerald-500/35 bg-emerald-500/12" : "border-transparent"
            }`}
            style={
              allComplete && hasFiles
                ? undefined
                : {
                    backgroundColor: "var(--bizzi-uppy-primary-muted)",
                    borderColor: "var(--bizzi-upload-border-subtle)",
                  }
            }
          >
            {allComplete && hasFiles ? (
              <Check className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
            ) : hasFiles && uploadingCount === 0 && completedCount === 0 ? (
              <Upload
                className="h-[18px] w-[18px]"
                style={{ color: "var(--bizzi-uppy-primary)" }}
                aria-hidden
              />
            ) : hasFiles ? (
              <Loader2
                className="h-[18px] w-[18px] animate-spin"
                style={{ color: "var(--bizzi-uppy-primary)" }}
                aria-hidden
              />
            ) : (
              <Upload
                className="h-[18px] w-[18px]"
                style={{ color: "var(--bizzi-uppy-primary)" }}
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0">
            {destinationMode === "creator_raw" && lockedDestination ? (
              <>
                <span className="bizzi-upload-panel-eyebrow block">Creator RAW</span>
                <p className="truncate text-[0.9375rem] font-semibold tracking-tight text-[var(--bizzi-upload-text)]">
                  Uploading to Creator RAW
                </p>
                <p className="bizzi-upload-panel-subtitle mt-0.5 truncate text-xs">
                  Stored in {(targetDriveName || driveName || "RAW").trim()} · source footage and LUT preview workflow
                </p>
              </>
            ) : (
              <>
                <span className="bizzi-upload-panel-eyebrow block">Upload</span>
                <p className="truncate text-[0.9375rem] font-semibold tracking-tight text-[var(--bizzi-upload-text)]">
                  {headerLabel}
                </p>
              </>
            )}
            <p className="bizzi-upload-panel-subtitle mt-0.5 text-xs">
              {hasFiles
                ? `${formatBytes(bytesUploaded)} / ${formatBytes(bytesTotal)}${
                    fileCount > 0 ? ` · ${completedCount} of ${fileCount} files` : ""
                  }`
                : "Drop files or click to browse"}
            </p>
            {(workspaceName || scopeLabel || driveName) && (
              <div className="bizzi-upload-panel-meta mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {driveName && (
                  <span>
                    Drive: <strong className="font-semibold text-[var(--bizzi-upload-text)]">{driveName}</strong>
                  </span>
                )}
                {workspaceName && (
                  <span>
                    Destination:{" "}
                    <strong className="font-semibold text-[var(--bizzi-upload-text)]">{workspaceName}</strong>
                  </span>
                )}
                {scopeLabel && (
                  <span>
                    Visibility: <strong className="font-semibold text-[var(--bizzi-upload-text)]">{scopeLabel}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {expanded ? (
            <ChevronDown className="bizzi-upload-panel-icon-btn h-4 w-4 opacity-70" aria-hidden />
          ) : (
            <ChevronUp className="bizzi-upload-panel-icon-btn h-4 w-4 opacity-70" aria-hidden />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePanelClose();
            }}
            className="bizzi-upload-panel-icon-btn p-2"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </button>

      {/* Progress bar - show when there are files */}
      {hasFiles && (
        <div className="bizzi-upload-panel-progress-track h-1 w-full shrink-0">
          <div
            className={`h-full transition-all duration-300 ${allComplete ? "bg-emerald-500 dark:bg-emerald-500" : ""}`}
            style={
              allComplete
                ? { width: `${pct}%` }
                : { width: `${pct}%`, backgroundColor: "var(--bizzi-uppy-primary)" }
            }
          />
        </div>
      )}

      {/* Expanded: Uppy Dashboard */}
      {expanded && ready && uppyRef.current && (
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ borderTop: "1px solid var(--bizzi-upload-divider)" }}
        >
          {macosPackageWarning && (
            <div className="mx-4 mt-3 whitespace-pre-wrap rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/45 dark:text-amber-100">
              {macosPackageWarning}
            </div>
          )}
          <div className="mx-3 mb-[max(0.65rem,env(safe-area-inset-bottom))] mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
            <UppyUploadPanelExpanded
              uppy={uppyRef.current}
              uppyRef={uppyRef}
              uppyDataTheme={uppyDataTheme}
              dashboardHeight={dashboardHeight}
              hasFiles={hasFiles}
              sessionGridTier={sessionGridTier}
              ingestPhase={ingestPhase}
              ingestAdded={ingestAdded}
              ingestTotal={ingestTotal}
              batchUiHint={batchUiHint}
              onAddFiles={(files) => void runChunkedAddRef.current(files)}
              queueDestinationChip={
                destinationMode === "creator_raw" && lockedDestination
                  ? (targetDriveName || driveName || "RAW").trim()
                  : null
              }
              dashboardNote="macOS libraries (.lrlibrary, .fcpbundle, …) upload with full folder structure when you drag the package from Finder onto this panel or use Add folder and select the library folder (not only Add files)."
            />
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(shell, document.body) : null;
}
