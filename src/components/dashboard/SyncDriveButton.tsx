"use client";

import { useState, useEffect, useRef } from "react";
import {
  HardDrive,
  Loader2,
  AlertCircle,
  ChevronDown,
  Plus,
} from "lucide-react";
import { useBackup } from "@/context/BackupContext";
import { useSubscription } from "@/hooks/useSubscription";
import { filterLinkedDrivesByPowerUp } from "@/lib/drive-powerup-filter";

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
  const { hasEditor, hasGallerySuite } = useSubscription();
  const visibleLinkedDrives = filterLinkedDrivesByPowerUp(linkedDrives, {
    hasEditor,
    hasGallerySuite,
  });

  const [showDriveList, setShowDriveList] = useState(false);
  const [linking, setLinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setShowDriveList(false);
      }
    }
    if (showDriveList) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showDriveList]);

  const handleSelectDrive = async (
    drive: (typeof visibleLinkedDrives)[number]
  ) => {
    setShowDriveList(false);
    await startSync(drive);
  };

  const handleAddNewDrive = async () => {
    if (!fsAccessSupported) return;
    setLinking(true);
    try {
      const handle = await pickDirectory();
      const drive = await linkDrive(handle.name, handle);
      setShowDriveList(false);
      await startSync(drive);
    } catch (err) {
      console.error(err);
    } finally {
      setLinking(false);
    }
  };

  const handleSyncClick = () => {
    if (visibleLinkedDrives.length === 0) {
      handleAddNewDrive();
    } else {
      setShowDriveList((prev) => !prev);
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
    <div className="space-y-2" ref={listRef}>
      <div className="relative">
        <button
          type="button"
          onClick={handleSyncClick}
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
              Sync
              {visibleLinkedDrives.length > 0 && (
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showDriveList ? "rotate-180" : ""}`}
                />
              )}
            </>
          )}
        </button>

        {showDriveList && visibleLinkedDrives.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <p className="border-b border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              Select drive to sync
            </p>
            {visibleLinkedDrives.map((drive) => (
              <button
                key={drive.id}
                type="button"
                onClick={() => handleSelectDrive(drive)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <HardDrive className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                <span className="truncate">{drive.name}</span>
                {drive.last_synced_at && (
                  <span className="ml-auto shrink-0 text-xs text-neutral-400">
                    {new Date(drive.last_synced_at).toLocaleDateString()}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={handleAddNewDrive}
              className="flex w-full items-center gap-2 border-t border-neutral-100 px-3 py-2.5 text-sm text-bizzi-blue transition-colors hover:bg-bizzi-blue/5 dark:border-neutral-700 dark:hover:bg-bizzi-blue/10"
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              Add new drive...
            </button>
          </div>
        )}
      </div>

      {(isSyncing || syncProgress?.status === "in_progress") && syncProgress && (
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
          {isSyncing && (
            <button
              type="button"
              onClick={cancelSync}
              className="mt-2 text-xs text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
            >
              Cancel
            </button>
          )}
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

      {visibleLinkedDrives.length > 0 && !isSyncing && !showDriveList && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {visibleLinkedDrives.length} drive{visibleLinkedDrives.length > 1 ? "s" : ""} linked
        </p>
      )}
    </div>
  );
}
