"use client";

import { Download, FolderInput, Loader2, Send, Share2, Trash2 } from "lucide-react";

export function BulkActionBar({
  selectedFileCount,
  selectedFolderCount,
  onMove,
  onNewTransfer,
  onShare,
  onDownload,
  isDownloading,
  onDelete,
  onClear,
}: {
  selectedFileCount: number;
  selectedFolderCount: number;
  onMove: () => void;
  onNewTransfer: () => void;
  onShare: () => void;
  onDownload?: () => void;
  isDownloading?: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  const total = selectedFileCount + selectedFolderCount;
  const parts: string[] = [];
  if (selectedFileCount > 0) parts.push(`${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`);
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;
  const canShare = total >= 1;
  const showDownload = selectedFileCount >= 1;
  const downloadDisabled = selectedFileCount > 50 || isDownloading;
  const downloadTitle = selectedFileCount > 50 ? "Download supports up to 50 files at once" : undefined;

  return (
    <div
      className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      style={{
        bottom: "max(8rem, calc(env(safe-area-inset-bottom, 0px) + 6rem))",
      }}
    >
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label} selected
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMove}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <FolderInput className="h-4 w-4" />
          Move
        </button>
        <button
          type="button"
          onClick={onNewTransfer}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-bizzi-blue hover:bg-bizzi-blue/10 dark:text-bizzi-cyan dark:hover:bg-bizzi-cyan/10"
        >
          <Send className="h-4 w-4" />
          New transfer
        </button>
        {canShare && (
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        )}
        {showDownload && onDownload && (
          <button
            type="button"
            onClick={onDownload}
            disabled={downloadDisabled}
            title={downloadTitle}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </div>
  );
}
