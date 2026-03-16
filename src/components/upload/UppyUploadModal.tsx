"use client";

import { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import AwsS3 from "@uppy/aws-s3";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Upload, ChevronUp, ChevronDown, X, Loader2, Check, AlertCircle } from "lucide-react";

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

interface UppyUploadModalProps {
  open: boolean;
  onClose: () => void;
  driveId: string;
  pathPrefix?: string;
  workspaceId?: string | null;
  galleryId?: string | null;
  initialFiles?: File[] | null;
  onUploadComplete?: () => void;
}

export default function UppyUploadModal({
  open,
  onClose,
  driveId,
  pathPrefix = "",
  workspaceId = null,
  galleryId = null,
  initialFiles = null,
  onUploadComplete,
}: UppyUploadModalProps) {
  const uppyRef = useRef<Uppy | null>(null);
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

    uppy.on("file-added", (file) => {
      const relPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
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
    uppy.on("upload-success", () => {
      updateProgress();
      onUploadComplete?.();
    });
    uppy.on("complete", () => {
      updateProgress();
      onUploadComplete?.();
    });

    if (initialFiles?.length) {
      try {
        initialFiles.forEach((f) => uppy.addFile({ name: f.name, data: f }));
      } catch {
        // ignore
      }
    }

    uppyRef.current = uppy;
    setReady(true);

    return () => {
      uppy.cancelAll();
      uppy.destroy();
      uppyRef.current = null;
      setReady(false);
    };
  }, [open, driveId, pathPrefix, workspaceId, galleryId, initialFiles, onUploadComplete]);

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
          <Dashboard
            uppy={uppyRef.current}
            proudlyDisplayPoweredByUppy={false}
            height={380}
          />
        </div>
      )}
    </div>
  );
}
