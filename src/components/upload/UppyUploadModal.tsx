"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import AwsS3 from "@uppy/aws-s3";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  attachUppyLocalPreview,
  getUploadRelativePath,
  revokeUppyPreview,
} from "@/lib/uppy-local-preview";
import { Upload, ChevronUp, ChevronDown, X, Loader2, Check } from "lucide-react";

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
  pendingFiles: File[];
  onPendingFilesConsumed: () => void;
  onUploadComplete?: () => void;
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
  pendingFiles,
  onPendingFilesConsumed,
  onUploadComplete,
}: UppyUploadModalProps) {
  const uppyRef = useRef<Uppy | null>(null);
  const onUploadCompleteRef = useRef(onUploadComplete);
  onUploadCompleteRef.current = onUploadComplete;

  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [progress, setProgress] = useState({
    bytesUploaded: 0,
    bytesTotal: 0,
    fileCount: 0,
    uploadingCount: 0,
    completedCount: 0,
    failedCount: 0,
    allComplete: false,
  });

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    const getAuthHeaders = async () => {
      const token = await (getFirebaseAuth().currentUser?.getIdToken(true) ?? Promise.resolve(null));
      return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const uppy = new Uppy({
      id: "uppy-upload",
      autoProceed: false,
      allowMultipleUploadBatches: true,
    });

    const awsS3Opts = {
      id: "AwsS3",
      endpoint: typeof window !== "undefined" ? `${window.location.origin}/api/uppy` : "",
      headers: {} as Record<string, string>,
      shouldUseMultipart: (file: { size?: number | null }) => (file.size ?? 0) > 5 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
    };
    uppy.use(AwsS3, awsS3Opts);

    uppy.addPreProcessor(async () => {
      const plugin = uppy.getPlugin("AwsS3");
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        throw new Error("You must be signed in to upload files.");
      }
      plugin?.setOptions({ headers });
    });

    const usedNames = new Map<string, number>();
    uppy.on("file-added", (file) => {
      const fileData = file.data instanceof File ? file.data : null;
      const webkitRel = fileData ? getUploadRelativePath(fileData, file.name) : file.name;

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
          lastModified:
            (file.data instanceof File ? file.data.lastModified : null) ??
            (file as { lastModified?: number }).lastModified ??
            null,
        },
      });
      if (fileData) {
        void attachUppyLocalPreview((preview) => {
          uppy.setFileState(file.id, { preview });
        }, fileData);
      }
      queueMicrotask(() => resumeUploadIfNeeded(uppy));
    });

    uppy.on("file-removed", (removed) => {
      revokeUppyPreview(removed.preview);
    });

    const updateProgress = () => {
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

    uppy.on("upload-progress", updateProgress);
    uppy.on("upload-error", updateProgress);
    uppy.on("upload-success", async (file) => {
      if (!file) return;
      const size = file.size ?? 0;
      if (size > 0 && size <= 5 * 1024 * 1024) {
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
          try {
            const token = await getFirebaseAuth().currentUser?.getIdToken(true);
            if (!token) return;
            await fetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/uppy/presigned-complete`, {
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
              }),
            });
          } catch {
            // Non-blocking; file is in B2, record creation may retry or user can re-upload
          }
        }
      }
      updateProgress();
      onUploadCompleteRef.current?.();
    });
    uppy.on("complete", () => {
      updateProgress();
      onUploadCompleteRef.current?.();
    });

    uppyRef.current = uppy;
    setReady(true);

    return () => {
      uppy.cancelAll();
      uppy.destroy();
      uppyRef.current = null;
      setReady(false);
    };
  }, [open, driveId, pathPrefix, workspaceId, galleryId]);

  const consumePending = useCallback(() => {
    onPendingFilesConsumed();
  }, [onPendingFilesConsumed]);

  useEffect(() => {
    if (!open || !ready || !uppyRef.current || pendingFiles.length === 0) return;
    const uppy = uppyRef.current;
    for (const f of pendingFiles) {
      try {
        uppy.addFile({ name: f.name, data: f });
      } catch {
        // ignore restriction / duplicate
      }
    }
    consumePending();
    setExpanded(true);
    queueMicrotask(() => resumeUploadIfNeeded(uppy));
  }, [open, ready, pendingFiles, consumePending]);

  if (!open) return null;

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

  return (
    <div
      className="fixed bottom-4 left-4 z-50 w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      role="status"
      aria-live="polite"
      aria-label="Upload panel"
    >
      {/* Collapsible header - always visible */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              allComplete && hasFiles
                ? "bg-green-500/10 dark:bg-green-500/20"
                : "bg-bizzi-blue/10 dark:bg-bizzi-blue/20"
            }`}
          >
            {allComplete && hasFiles ? (
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : hasFiles && uploadingCount === 0 && completedCount === 0 ? (
              <Upload className="h-4 w-4 text-bizzi-blue dark:text-bizzi-cyan" />
            ) : hasFiles ? (
              <Loader2 className="h-4 w-4 animate-spin text-bizzi-blue dark:text-bizzi-cyan" />
            ) : (
              <Upload className="h-4 w-4 text-bizzi-blue dark:text-bizzi-cyan" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
              {headerLabel}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {hasFiles
                ? `${formatBytes(bytesUploaded)} / ${formatBytes(bytesTotal)}${
                    fileCount > 0 ? ` · ${completedCount} of ${fileCount} files` : ""
                  }`
                : "Drop files or click to browse"}
            </p>
            {(workspaceName || scopeLabel || driveName) && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {driveName && (
                  <span className="text-neutral-600 dark:text-neutral-300">
                    Drive: <strong>{driveName}</strong>
                  </span>
                )}
                {workspaceName && (
                  <span className="text-neutral-600 dark:text-neutral-300">
                    Destination: <strong>{workspaceName}</strong>
                  </span>
                )}
                {scopeLabel && (
                  <span className="text-neutral-600 dark:text-neutral-300">
                    Visibility: <strong>{scopeLabel}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-neutral-400" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </button>

      {/* Progress bar - show when there are files */}
      {hasFiles && (
        <div className="h-1 bg-neutral-100 dark:bg-neutral-800">
          <div
            className={`h-full transition-all duration-300 ${
              allComplete ? "bg-green-500 dark:bg-green-600" : "bg-bizzi-blue dark:bg-bizzi-cyan"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Expanded: Uppy Dashboard */}
      {expanded && ready && uppyRef.current && (
        <div className="border-t border-neutral-100 dark:border-neutral-800">
          <p className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
            Previews: images, RAW (when the browser can decode them), and a still frame for videos.
            Final Cut libraries: drop the <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">.fcpbundle</code>{" "}
            folder (or pick the folder if your browser offers &quot;Upload folder&quot;) so all files keep their paths.
          </p>
          <Dashboard uppy={uppyRef.current} proudlyDisplayPoweredByUppy={false} height={380} />
        </div>
      )}
    </div>
  );
}
