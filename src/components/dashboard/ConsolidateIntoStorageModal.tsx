"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { LinkedDrive } from "@/types/backup";
import { consolidateLegacyDriveIntoStorage } from "@/lib/consolidate-legacy-drive-client";

interface ConsolidateIntoStorageModalProps {
  open: boolean;
  onClose: () => void;
  /** Legacy custom linked drive to consolidate */
  sourceDrive: LinkedDrive | null;
  onSuccess: () => void;
}

export default function ConsolidateIntoStorageModal({
  open,
  onClose,
  sourceDrive,
  onSuccess,
}: ConsolidateIntoStorageModalProps) {
  const { user } = useAuth();
  const [folderName, setFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && sourceDrive) {
      setFolderName(sourceDrive.name.replace(/^\[Team\]\s+/, ""));
      setError(null);
    }
  }, [open, sourceDrive]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sourceDrive || !user) return;
      const trimmed = folderName.trim();
      if (!trimmed) {
        setError("Folder name cannot be empty");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await consolidateLegacyDriveIntoStorage(
          () => user.getIdToken(),
          sourceDrive.id,
          trimmed,
        );
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Consolidation failed");
      } finally {
        setLoading(false);
      }
    },
    [sourceDrive, user, folderName, onSuccess, onClose]
  );

  if (!open || !sourceDrive) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="consolidate-storage-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="consolidate-storage-title"
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            Consolidate into Storage
          </h2>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          All active files in <span className="font-medium text-neutral-800 dark:text-neutral-200">&quot;{sourceDrive.name}&quot;</span>{" "}
          move into a real folder under your main Storage drive. This legacy entry stays as a shortcut
          until you dismiss it (same name; you can rename the folder in Storage after).
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="consolidate-folder-name" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Folder name in Storage
            </label>
            <input
              id="consolidate-folder-name"
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950 dark:text-white"
              disabled={loading}
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => !loading && onClose()}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-bizzi-blue px-3 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-60"
            >
              {loading ? "Moving…" : "Move files into Storage"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
