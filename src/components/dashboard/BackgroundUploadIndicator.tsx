"use client";

import { useState } from "react";
import { Upload, ChevronUp, ChevronDown, X } from "lucide-react";
import { useBackup } from "@/context/BackupContext";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Floating indicator for background uploads. Stays visible so users can browse
 * the platform while uploads continue. Collapsible to a compact pill.
 */
export default function BackgroundUploadIndicator() {
  const { fileUploadProgress, cancelFileUpload } = useBackup();
  const [expanded, setExpanded] = useState(true);

  const show =
    fileUploadProgress?.status === "in_progress" && fileUploadProgress.files.length > 0;
  if (!show || !fileUploadProgress) return null;

  const { files, bytesTotal, bytesSynced } = fileUploadProgress;
  const pct = bytesTotal > 0 ? Math.min(100, (bytesSynced / bytesTotal) * 100) : 0;
  const uploadingCount = files.filter((f) => f.status === "uploading").length;

  return (
    <div
      className="fixed bottom-4 left-4 z-50 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      role="status"
      aria-live="polite"
      aria-label={`${uploadingCount} file(s) uploading in background`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bizzi-blue/10 dark:bg-bizzi-blue/20">
            <Upload className="h-4 w-4 text-bizzi-blue dark:text-bizzi-cyan" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
              {uploadingCount} uploading
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
              className="h-full bg-bizzi-blue transition-all duration-300 dark:bg-bizzi-cyan"
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
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-500">
                    {formatBytes(file.bytesSynced)}/{formatBytes(file.size)}
                  </span>
                  {file.status === "uploading" && (
                    <button
                      type="button"
                      onClick={() => cancelFileUpload(file.id)}
                      className="rounded p-0.5 text-neutral-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-neutral-700 dark:hover:text-red-400"
                      aria-label={`Cancel ${file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
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
