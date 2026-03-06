"use client";

import { useState } from "react";
import { HardDrive, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { useBackup } from "@/context/BackupContext";

export default function SyncDriveButton() {
  const {
    linkedDrives,
    linkDrive,
    startSync,
    cancelSync,
    syncProgress,
    isSyncing,
    error,
    fsAccessSupported,
    pickDirectory,
  } = useBackup();

  const [linking, setLinking] = useState(false);

  const handleSync = async () => {
    if (!fsAccessSupported) return;

    if (linkedDrives.length === 0) {
      setLinking(true);
      try {
        const handle = await pickDirectory();
        const drive = await linkDrive(handle.name, handle);
        await startSync(drive);
      } catch (err) {
        console.error(err);
      } finally {
        setLinking(false);
      }
    } else {
      await startSync(linkedDrives[0]);
    }
  };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024)
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (!fsAccessSupported) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Backup requires Chrome or Edge. Safari has limited support.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing || linking}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-bizzi-blue px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSyncing || linking ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {linking ? "Linking..." : "Syncing..."}
          </>
        ) : (
          <>
            <HardDrive className="h-4 w-4" />
            {linkedDrives.length > 0
              ? "Sync"
              : "Sync drive"}
          </>
        )}
      </button>

      {isSyncing && syncProgress && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-neutral-600 dark:text-neutral-400">
              {syncProgress.filesCompleted} / {syncProgress.filesTotal} files
            </span>
            <span className="font-medium text-neutral-900 dark:text-white">
              {formatBytes(syncProgress.bytesSynced)} /{" "}
              {formatBytes(syncProgress.bytesTotal)}
            </span>
          </div>
          <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-bizzi-blue transition-all duration-300"
              style={{
                width: `${
                  syncProgress.bytesTotal > 0
                    ? (syncProgress.bytesSynced / syncProgress.bytesTotal) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          {syncProgress.currentFile && (
            <p
              className="truncate text-xs text-neutral-500 dark:text-neutral-400"
              title={syncProgress.currentFile}
            >
              {syncProgress.currentFile}
            </p>
          )}
          <button
            type="button"
            onClick={cancelSync}
            className="mt-2 text-xs text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
          >
            Cancel
          </button>
        </div>
      )}

      {syncProgress?.status === "completed" && (
        <p className="text-xs text-green-600 dark:text-green-400">
          Backup complete
        </p>
      )}

      {syncProgress?.status === "failed" && syncProgress.error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {syncProgress.error}
        </p>
      )}

      {error && !syncProgress && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </p>
      )}

      {linkedDrives.length > 0 && !isSyncing && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {linkedDrives[0].name}
          {linkedDrives[0].last_synced_at && (
            <> · Last: {new Date(linkedDrives[0].last_synced_at).toLocaleDateString()}</>
          )}
        </p>
      )}
    </div>
  );
}
