"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type RefObject,
  type Dispatch,
  type SetStateAction,
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
import { getUploadApiBaseUrl } from "@/lib/upload-api-base";
import {
  getAggregateProgressThrottleMs,
  getBatchTierFromCount,
  getGalleryProgressMinIntervalMs,
  maxBatchTier,
  UPLOAD_GRID_VIRTUAL_ROW_STRIDE,
  type BatchTier,
} from "@/lib/uppy-mass-upload-constants";
import { createMassUploadDebug } from "@/lib/uppy-mass-upload-debug";
import {
  flatMacosPackageUserMessage,
  isLikelyFlatMacosPackageBrowserUpload,
} from "@/lib/macos-package-bundles";
import { shouldUseUppyS3Multipart } from "@/lib/uppy-multipart-policy";
import { computeBrowserMultipartPartPlan } from "@/lib/browser-multipart-plan";
import { getUploadMultipartProfileLabel } from "@/lib/multipart-thresholds";
import {
  isUploadControlPlaneFetchUrl,
  isUploadSessionTelemetryEnabled,
  logUploadSessionTelemetry,
} from "@/lib/upload-session-telemetry";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import UppyUploadPanelExpanded, { type UploadPanelMetrics } from "./UppyUploadPanelExpanded";
import { enqueuePresignedComplete } from "@/lib/presigned-complete-queue";
import { collectFilesFromDataTransfer } from "@/lib/browser-data-transfer-files";
import { creatorRawClientAllowsUploadAttempt } from "@/lib/creator-raw-upload-policy";
import { CREATOR_RAW_REJECTION_MESSAGES } from "@/lib/creator-raw-media-config";
import { useTheme } from "@/context/ThemeContext";
import { useUppyBizziThemeVariables } from "@/hooks/useUppyBizziTheme";
import type { GalleryManageUploadLifecycleEvent } from "@/lib/gallery-manage-upload-lifecycle";
import { dispatchStorageUploadComplete } from "@/lib/storage-upload-complete-event";
import type { UploadDockSummary } from "@/context/UppyUploadContext";
import "@/styles/uppy-bizzi-theme.css";
import "@/styles/uppy-bizzi-premium.css";

/** Uppy AwsS3 uses Promise.allSettled: when one file fails, others continue.
 * We track failed files and surface them so users can retry from the Dashboard. */

import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

/** Conservative mobile-first defaults until the resize observer runs. */
const DEFAULT_PANEL_METRICS: UploadPanelMetrics = {
  fileGridMin: UPLOAD_GRID_VIRTUAL_ROW_STRIDE,
  fileGridMax: 220,
};

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
    return;
  }
  const anyQueued = Object.values(files).some(
    (f) => !f.error && f.progress?.uploadComplete !== true
  );
  if (anyQueued) {
    uppy.upload().catch(() => {});
  }
}

/** With `allowMultipleUploadBatches`, `complete` fires per `upload()` wave — not when the dashboard queue is fully idle. */
function uppyHasPendingUploadWork(uppy: Uppy): boolean {
  for (const f of uppy.getFiles()) {
    if (f.error) continue;
    if (f.progress?.uploadComplete !== true) return true;
  }
  return false;
}

interface UppyUploadModalProps {
  open: boolean;
  onClose: () => void;
  uploadQueueExpanded: boolean;
  onUploadQueueExpandedChange: (expanded: boolean) => void;
  workspaceUploadAnchorRef: RefObject<HTMLDivElement | null>;
  onDockSummaryChange: Dispatch<SetStateAction<UploadDockSummary>>;
  driveId: string;
  pathPrefix?: string;
  storageFolderId?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  scopeLabel?: string | null;
  driveName?: string | null;
  /** Nested Storage v2 folder label for destination UX */
  storageFolderDisplayName?: string | null;
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
  uploadQueueExpanded,
  onUploadQueueExpandedChange,
  workspaceUploadAnchorRef,
  onDockSummaryChange,
  driveId,
  pathPrefix = "",
  storageFolderId = null,
  workspaceId = null,
  workspaceName = null,
  scopeLabel = null,
  driveName = null,
  storageFolderDisplayName = null,
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onDockSummaryChangeRef = useRef(onDockSummaryChange);
  onDockSummaryChangeRef.current = onDockSummaryChange;

  const [ready, setReady] = useState(false);
  const [panelPlacement, setPanelPlacement] = useState<{
    left: number;
    bottom: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [panelMetrics, setPanelMetrics] = useState<UploadPanelMetrics>(DEFAULT_PANEL_METRICS);
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
  /** True while a multi-file chunked ingest runs — defers thumbnail work so the queue stays responsive. */
  const ingestDeferPreviewsRef = useRef(false);
  const sessionGridTierRef = useRef<BatchTier>("normal");
  const ingestAbortRef = useRef<AbortController | null>(null);
  const runChunkedAddRef = useRef<(files: File[]) => Promise<void>>(async () => {});
  const ingestChainRef = useRef(Promise.resolve());
  const galleryProgressLastRef = useRef<Map<string, number>>(new Map());
  const storageGridRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const galleryIdForStorageRefreshRef = useRef(galleryId);
  galleryIdForStorageRefreshRef.current = galleryId;

  type UppyTelRec = {
    t0: number;
    cp0: number;
    firstPutOffsetMs: number | null;
    retries: number;
  };
  const uppyTelByFileRef = useRef<Map<string, UppyTelRec>>(new Map());
  const uppyTelCpRef = useRef(0);

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
      const w = window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const isNarrow = w < 640;
      const isCompact = w < 900;

      let fileGridMin: number;
      let fileGridMax: number;

      if (isNarrow) {
        fileGridMin = UPLOAD_GRID_VIRTUAL_ROW_STRIDE;
        fileGridMax = Math.min(240, Math.max(140, Math.round(vh * 0.3)));
      } else if (isCompact) {
        fileGridMin = 160;
        fileGridMax = Math.min(360, Math.max(220, Math.round(vh * 0.34)));
      } else {
        fileGridMin = 200;
        fileGridMax = 420;
      }

      setPanelMetrics({ fileGridMin, fileGridMax });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPlacement(null);
      return;
    }
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const gutter = 16;
      const panelWidth = Math.min(380, Math.max(280, vw - gutter * 2));
      /** Bottom-left of the viewport so the panel is not clipped on the right; cloud trigger lives in the Workspace rail. */
      setPanelPlacement({
        left: gutter,
        bottom: gutter,
        width: panelWidth,
        maxHeight: Math.min(Math.floor(vh * 0.72), 720),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open, uploadQueueExpanded]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

    const getAuthHeaders = async () => {
      // Cached token only — forcing refresh per batch hammered securetoken.googleapis.com during
      // .fcpbundle-style uploads (thousands of small files), causing 429/400 and upload failures.
      const token = await getAuthToken(false);
      return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const creatorRawLocked =
      destinationMode === "creator_raw" && lockedDestination === true;

    const scheduleStorageGridRefresh = () => {
      if (galleryIdForStorageRefreshRef.current) return;
      if (typeof window === "undefined") return;
      if (storageGridRefreshTimerRef.current) {
        clearTimeout(storageGridRefreshTimerRef.current);
      }
      storageGridRefreshTimerRef.current = setTimeout(() => {
        storageGridRefreshTimerRef.current = null;
        dispatchStorageUploadComplete({
          driveId,
          workspaceId: workspaceId ?? null,
        });
      }, 380);
    };

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
      endpoint:
        typeof window !== "undefined" ? `${getUploadApiBaseUrl()}/api/uppy` : "",
      headers: {} as Record<string, string>,
      /** Aligned with `BROWSER_MULTIPART_CONCURRENCY` / server upload policy */
      limit: 6,
      shouldUseMultipart: shouldUseUppyS3Multipart,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadPartBytes: uploadPartBytesCompat,
    };
    uppy.use(AwsS3, awsS3Opts);
    uppyRefLocal.current = uppy;

    let restoreFetch: (() => void) | null = null;
    if (typeof window !== "undefined" && isUploadSessionTelemetryEnabled()) {
      const origFetch = window.fetch.bind(window);
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (isUploadControlPlaneFetchUrl(u)) uppyTelCpRef.current += 1;
        return origFetch(input as RequestInfo, init);
      }) as typeof window.fetch;
      restoreFetch = () => {
        window.fetch = origFetch;
      };
    }

    const logUppyFileSession = (
      f: { id: string; size?: number | null; meta?: Record<string, unknown>; name?: string },
      p: {
        completionOk: boolean;
        finalizeOk: boolean;
        outcome: "success" | "failure" | "already_exists" | "deduped";
        error?: string;
      }
    ) => {
      if (!isUploadSessionTelemetryEnabled()) return;
      const rec = uppyTelByFileRef.current.get(f.id);
      const size = f.size ?? 0;
      const multipart = shouldUseUppyS3Multipart({ size, meta: f.meta ?? {} });
      const plan = computeBrowserMultipartPartPlan(size);
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      logUploadSessionTelemetry({
        surface: "uppy",
        multipartProfile: getUploadMultipartProfileLabel(),
        uploadMode: multipart ? "multipart" : "single_put",
        fileSizeBytes: size,
        partSizeBytes: multipart ? plan.partSize : 0,
        concurrency: multipart ? plan.recommendedConcurrency : 1,
        totalParts: multipart ? plan.totalParts : 1,
        timeToFirstB2PutMs: rec?.firstPutOffsetMs ?? null,
        totalDurationMs: rec ? Math.max(0, now - rec.t0) : 0,
        controlPlaneRequests: rec ? Math.max(0, uppyTelCpRef.current - rec.cp0) : 0,
        retryCount: rec?.retries ?? 0,
        ...p,
      });
      uppyTelByFileRef.current.delete(f.id);
    };

    uppy.on("upload-start", (files) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const cp = uppyTelCpRef.current;
      for (const f of files) {
        uppyTelByFileRef.current.set(f.id, {
          t0: now,
          cp0: cp,
          firstPutOffsetMs: null,
          retries: 0,
        });
      }
    });

    uppy.on("upload-retry", (f) => {
      if (!f) return;
      const e = uppyTelByFileRef.current.get(f.id);
      if (e) e.retries += 1;
    });

    uppy.addPreProcessor(async () => {
      const plugin = uppy.getPlugin("AwsS3");
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        throw new Error("You must be signed in to upload files.");
      }
      plugin?.setOptions({ headers });
    });

    const massDebug = createMassUploadDebug();
    /** Same relative path twice in one batch → disambiguate leaf (gallery + v2 folder uploads). */
    const usedNames = new Map<string, number>();
    const bumpDuplicateRelativePath = (rel: string, fileNameFallback: string): string => {
      const n = usedNames.get(rel) ?? 0;
      usedNames.set(rel, n + 1);
      if (n === 0) return rel;
      const segments = rel.split("/");
      const leaf = segments.pop() ?? fileNameFallback;
      const base = leaf.replace(/\.([^.]+)$/, "");
      const ext = leaf.includes(".") ? leaf.slice(leaf.lastIndexOf(".")) : "";
      const renamedLeaf = `${base} (${n})${ext}`;
      return [...segments, renamedLeaf].filter(Boolean).join("/");
    };

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
      onDockSummaryChangeRef.current({
        fileCount: files.length,
        uploadingCount,
        allComplete: files.length === 0 ? true : allComplete,
        hasFailures: failedCount > 0,
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
        const deferPreviews = incoming.length >= 6;
        ingestDeferPreviewsRef.current = deferPreviews;
        const toDescriptors = (slice: File[]) =>
          slice.map((f) => {
            const rel = f.webkitRelativePath?.trim() || "";
            return { name: rel || f.name, data: f };
          });
        try {
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
        } finally {
          ingestDeferPreviewsRef.current = false;
        }
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
      if (autoCloseTimer != null) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
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
        uniqueName = bumpDuplicateRelativePath(webkitRel, file.name);
      } else if (storageFolderId && !galleryId) {
        // Full tree relative path keeps B2 object keys unique (e.g. SubA/clip.mov vs SubB/clip.mov).
        // v2 finalize still uses the path leaf as file_name; parent folder comes from folder_id.
        uniqueName = bumpDuplicateRelativePath(webkitRel, file.name);
      }
      const relPath = pathPrefix ? `${pathPrefix}/${uniqueName}` : uniqueName;
      uppy.setFileState(file.id, {
        meta: {
          ...file.meta,
          driveId,
          relativePath: relPath,
          storageFolderId: storageFolderId ?? undefined,
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
        // "large" must not use idle/eager previews: hundreds of video poster extractions or
        // image object URLs exhaust memory and crash the tab before upload starts.
        const mode =
          tier === "extreme" || tier === "large"
            ? "skip"
            : ingestDeferPreviewsRef.current
              ? "idle"
              : "eager";
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
      if (file && progress) {
        const bytesUploaded = Number((progress as { bytesUploaded?: number }).bytesUploaded ?? 0);
        if (bytesUploaded > 0) {
          const rec = uppyTelByFileRef.current.get(file.id);
          if (rec && rec.firstPutOffsetMs == null) {
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            rec.firstPutOffsetMs = now - rec.t0;
          }
        }
      }
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
      if (file && isUploadSessionTelemetryEnabled()) {
        const size = file.size ?? 0;
        const multipart = shouldUseUppyS3Multipart({ size, meta: file.meta ?? {} });
        const plan = computeBrowserMultipartPartPlan(size);
        const rec = uppyTelByFileRef.current.get(file.id);
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        logUploadSessionTelemetry({
          surface: "uppy",
          multipartProfile: getUploadMultipartProfileLabel(),
          uploadMode: multipart ? "multipart" : "single_put",
          fileSizeBytes: size,
          partSizeBytes: multipart ? plan.partSize : 0,
          concurrency: multipart ? plan.recommendedConcurrency : 1,
          totalParts: multipart ? plan.totalParts : 1,
          timeToFirstB2PutMs: rec?.firstPutOffsetMs ?? null,
          totalDurationMs: rec ? Math.max(0, now - rec.t0) : 0,
          controlPlaneRequests: rec ? Math.max(0, uppyTelCpRef.current - rec.cp0) : 0,
          retryCount: rec?.retries ?? 0,
          completionOk: false,
          finalizeOk: false,
          outcome: "failure",
          error: error?.message ?? "Upload failed",
        });
        uppyTelByFileRef.current.delete(file.id);
      }
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
      const multipart = shouldUseUppyS3Multipart({ size, meta: file.meta ?? {} });
      if (size > 0 && !multipart) {
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
            let finalizeOk = true;
            let telemetryError: string | undefined;
            let data: { error?: string } = {};
            try {
              const token = await getAuthToken(false);
              if (!token) {
                finalizeOk = false;
                telemetryError = "no_auth_token";
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
                `${typeof window !== "undefined" ? getUploadApiBaseUrl() : ""}/api/uppy/presigned-complete`,
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
                    folder_id: meta.storageFolderId ?? meta.folder_id ?? null,
                  }),
                }
              );
              try {
                data = (await res.json()) as { error?: string };
              } catch {
                /* non-JSON body */
              }
              if (!res.ok) {
                finalizeOk = false;
                telemetryError =
                  typeof data.error === "string" && data.error.trim()
                    ? data.error.trim()
                    : "presigned_complete_http_error";
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
              } else {
                scheduleStorageGridRefresh();
              }
            } catch {
              finalizeOk = false;
              telemetryError = "presigned_complete_network_error";
              const msg =
                "Could not reach the server to finish saving your upload. Check your connection and try again.";
              uppy.setFileState(file.id, { error: msg });
              uppy.info({ message: msg, details: file.name }, "error", 12_000);
              flushProgress();
              const metaInner = file.meta ?? {};
              if (galleryId && (metaInner.galleryId ?? metaInner.gallery_id)) {
                onGalleryManageUploadLifecycleRef.current?.({
                  type: "upload_error",
                  clientId: file.id,
                  message: msg,
                });
              }
            } finally {
              logUppyFileSession(file, {
                completionOk: true,
                finalizeOk,
                outcome: finalizeOk ? "success" : "failure",
                error: telemetryError,
              });
            }
          });
        } else {
          logUppyFileSession(file, {
            completionOk: true,
            finalizeOk: true,
            outcome: "success",
          });
        }
      } else {
        logUppyFileSession(file, {
          completionOk: true,
          finalizeOk: true,
          outcome: "success",
        });
      }
      if (!galleryId && (file.size ?? 0) > 0) {
        scheduleStorageGridRefresh();
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
    uppy.on("complete", (result) => {
      flushProgress();
      if (autoCloseTimer != null) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      // Defer so Uppy / resumeUploadIfNeeded microtasks can start the next batch before we decide.
      setTimeout(() => {
        if (uppyHasPendingUploadWork(uppy)) return;
        onUploadCompleteRef.current?.();
        const successful = result?.successful ?? [];
        const failed = result?.failed ?? [];
        if (failed.length === 0 && successful.length > 0) {
          autoCloseTimer = setTimeout(() => {
            autoCloseTimer = null;
            onCloseRef.current();
          }, 5000);
        }
      }, 0);
    });

    uppyRef.current = uppy;
    setReady(true);

    return () => {
      if (storageGridRefreshTimerRef.current) {
        clearTimeout(storageGridRefreshTimerRef.current);
        storageGridRefreshTimerRef.current = null;
      }
      if (autoCloseTimer != null) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      if (galleryAssetDebouncedTimerRef.current) {
        clearTimeout(galleryAssetDebouncedTimerRef.current);
        galleryAssetDebouncedTimerRef.current = null;
      }
      if (aggTimeout != null) {
        clearTimeout(aggTimeout);
        aggTimeout = null;
      }
      massDebug?.resetProgressMeter();
      restoreFetch?.();
      uppyTelByFileRef.current.clear();
      uppyTelCpRef.current = 0;
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
    storageFolderId,
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
    onUploadQueueExpandedChange(true);
    void runChunkedAddRef.current(batch);
  }, [open, ready, pendingFiles, consumePending, onUploadQueueExpandedChange]);

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
   * Fixed beside the Workspace rail; z below dashboard modals (see DashboardColorsModal z-[120]).
   * When the queue is collapsed, the panel stays mounted off-screen so uploads keep running.
   */
  const place = panelPlacement;
  const queueHidden = !uploadQueueExpanded;
  const shell = (
    <div
      className="bizzi-uppy-theme bizzi-upload-panel-shell flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-lg sm:rounded-2xl"
      style={{
        ...(uppyChromeVars as CSSProperties),
        backgroundColor: "var(--bizzi-upload-workspace-bg)",
        color: "var(--bizzi-upload-text)",
        position: "fixed",
        ...(place
          ? {
              left: place.left,
              bottom: place.bottom,
              width: place.width,
              maxHeight: place.maxHeight,
              zIndex: queueHidden ? 0 : 105,
              transform: queueHidden ? "translateX(calc(-100vw - 100%))" : "none",
              opacity: queueHidden ? 0 : 1,
              pointerEvents: queueHidden ? "none" : "auto",
            }
          : {
              left: 16,
              bottom: 16,
              width: Math.min(380, typeof window !== "undefined" ? window.innerWidth - 32 : 380),
              maxHeight: typeof window !== "undefined" ? Math.min(window.innerHeight * 0.72, 720) : 520,
              zIndex: queueHidden ? 0 : 105,
              transform: queueHidden ? "translateX(calc(-100vw - 100%))" : "none",
              opacity: queueHidden ? 0 : 1,
              pointerEvents: queueHidden ? "none" : "auto",
            }),
      }}
      data-uppy-theme={uppyDataTheme}
      role="status"
      aria-live="polite"
      aria-label="Upload panel"
      aria-hidden={queueHidden}
    >
      <div
        className="border-b px-3 py-2.5 sm:px-4"
        style={{ borderColor: "var(--bizzi-upload-divider)" }}
      >
        {destinationMode === "creator_raw" && lockedDestination ? (
          <>
            <span className="bizzi-upload-panel-eyebrow block text-[9px] tracking-[0.16em]">Creator RAW</span>
            <p className="truncate text-[0.875rem] font-semibold tracking-tight text-[var(--bizzi-upload-text)] sm:text-[0.9375rem]">
              Uploading to Creator RAW
            </p>
            <p className="bizzi-upload-panel-subtitle mt-0.5 line-clamp-2 text-[11px] leading-snug sm:text-xs">
              Stored in {(targetDriveName || driveName || "RAW").trim()}
            </p>
          </>
        ) : (
          <>
            <span className="bizzi-upload-panel-eyebrow block text-[9px] tracking-[0.16em]">Upload</span>
            <p className="truncate text-[0.875rem] font-semibold tracking-tight text-[var(--bizzi-upload-text)] sm:text-[0.9375rem]">
              {headerLabel}
            </p>
          </>
        )}
        <p className="bizzi-upload-panel-subtitle mt-0.5 text-[11px] sm:text-xs">
          {hasFiles
            ? `${formatBytes(bytesUploaded)} / ${formatBytes(bytesTotal)}${
                fileCount > 0 ? ` · ${completedCount} of ${fileCount} files` : ""
              }`
            : "Use Add files below or drag and drop onto the page"}
        </p>
        {hasFiles && hasFailures && uploadingCount > 0 ? (
          <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-200/95 sm:text-xs">
            Some files failed. Your other files are still uploading.
          </p>
        ) : null}
        {(workspaceName ||
          scopeLabel ||
          driveName ||
          (destinationMode === "storage" && !galleryId)) && (
          <div className="bizzi-upload-panel-meta mt-2 flex w-full min-w-0 flex-col gap-2 text-[11px] sm:text-xs">
            {destinationMode === "storage" && !galleryId ? (
              <div
                className="w-full min-w-0 rounded-xl border px-3 py-2.5 sm:px-3.5 sm:py-3"
                style={{
                  borderColor: "var(--bizzi-upload-border-subtle)",
                  backgroundColor:
                    "color-mix(in srgb, var(--bizzi-uppy-primary) 12%, transparent)",
                  boxShadow:
                    "inset 0 1px 0 0 color-mix(in srgb, var(--bizzi-uppy-primary) 18%, transparent)",
                }}
              >
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--bizzi-upload-text-muted)]">
                  Storage Drive
                </span>
                <p
                  className="mt-1 truncate text-[0.9375rem] font-semibold leading-tight text-[var(--bizzi-upload-text)] sm:text-base"
                  title={
                    storageFolderId
                      ? (storageFolderDisplayName?.trim() || "Folder")
                      : (driveName ?? "Storage")
                  }
                >
                  {storageFolderId
                    ? (storageFolderDisplayName?.trim() || "Selected folder")
                    : (driveName || "Storage")}
                </p>
              </div>
            ) : (
              driveName && (
                <span>
                  Drive:{" "}
                  <strong className="font-semibold text-[var(--bizzi-upload-text)]">{driveName}</strong>
                </span>
              )
            )}
            {workspaceName && (
              <span>
                Destination:{" "}
                <strong className="font-semibold text-[var(--bizzi-upload-text)]">{workspaceName}</strong>
              </span>
            )}
            {scopeLabel && (
              <span>
                Visibility:{" "}
                <strong className="font-semibold text-[var(--bizzi-upload-text)]">{scopeLabel}</strong>
              </span>
            )}
          </div>
        )}
      </div>

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

      {ready && uppyRef.current && (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ borderTop: "1px solid var(--bizzi-upload-divider)" }}
        >
          {macosPackageWarning && (
            <div className="mx-4 mt-3 whitespace-pre-wrap rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/45 dark:text-amber-100">
              {macosPackageWarning}
            </div>
          )}
          <div className="mx-2 mb-[max(0.65rem,env(safe-area-inset-bottom))] mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl sm:mx-3 sm:rounded-2xl">
            <UppyUploadPanelExpanded
              uppy={uppyRef.current}
              uppyRef={uppyRef}
              uppyDataTheme={uppyDataTheme}
              panelMetrics={panelMetrics}
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
                  : destinationMode === "storage" && storageFolderId
                    ? (storageFolderDisplayName?.trim() || "Folder")
                    : null
              }
            />
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(shell, document.body) : null;
}
