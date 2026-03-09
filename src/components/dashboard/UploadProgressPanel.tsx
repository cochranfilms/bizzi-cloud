"use client";

import { useState } from "react";
import { Upload, ChevronUp, ChevronDown, X, Loader2, Check } from "lucide-react";
import type { FileUploadProgress } from "@/types/backup";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface UploadProgressPanelProps {
  fileUploadProgress: FileUploadProgress;
  onCancelFile: (fileId: string) => void;
  /** When true, uses compact inline styling (no fixed positioning) */
  inline?: boolean;
}

/**
 * Reusable upload progress UI - collapsible with progress bar and per-file status.
 * Used inline in CreateTransferModal and as floating indicator in BackgroundUploadIndicator.
 */
export default function UploadProgressPanel({
  fileUploadProgress,
  onCancelFile,
  inline = false,
}: UploadProgressPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const { files, bytesTotal, bytesSynced, status } = fileUploadProgress;
  const pct = bytesTotal > 0 ? Math.min(100, (bytesSynced / bytesTotal) * 100) : 0;
  const uploadingCount = files.filter((f) => f.status === "uploading").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const allComplete = status === "completed";
  const hasPending = pendingCount > 0;

  const headerLabel = allComplete
    ? "Upload complete"
    : hasPending && uploadingCount === 0
      ? "Starting…"
      : `${uploadingCount} uploading`;

  const baseClasses = inline
    ? "w-full overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
    : "fixed bottom-4 left-4 z-50 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <div
      className={baseClasses}
      role="status"
      aria-live="polite"
      aria-label={`${uploadingCount} file(s) uploading`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              allComplete
                ? "bg-green-500/10 dark:bg-green-500/20"
                : "bg-bizzi-blue/10 dark:bg-bizzi-blue/20"
            }`}
          >
            {allComplete ? (
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : hasPending && uploadingCount === 0 ? (
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
              {formatBytes(bytesSynced)} / {formatBytes(bytesTotal)}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
        ) : (
          <ChevronUp className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
      </button>

      {expanded && (
        <>
          <div className="h-1 bg-neutral-100 dark:bg-neutral-800">
            <div
              className={`h-full transition-all duration-300 ${
                allComplete
                  ? "bg-green-500 dark:bg-green-600"
                  : "bg-bizzi-blue dark:bg-bizzi-cyan"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="max-h-40 overflow-y-auto border-t border-neutral-100 dark:border-neutral-800">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-2 border-b border-neutral-50 px-3 py-2 last:border-b-0 dark:border-neutral-800/50"
              >
                <span
                  className="min-w-0 truncate text-xs text-neutral-600 dark:text-neutral-400"
                  title={file.name}
                >
                  {file.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {file.status === "pending" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                  ) : file.status === "completed" ? (
                    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                      Done
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-neutral-500 dark:text-neutral-500">
                        {formatBytes(file.bytesSynced)}/{formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onCancelFile(file.id)}
                        className="rounded p-0.5 text-neutral-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-neutral-700 dark:hover:text-red-400"
                        aria-label={`Cancel ${file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
