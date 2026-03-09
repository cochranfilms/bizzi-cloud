"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Folder, FolderMinus, X } from "lucide-react";

interface DeleteGalleryModalProps {
  open: boolean;
  galleryTitle: string;
  onClose: () => void;
  onDelete: (options: { deleteFiles: boolean }) => Promise<void>;
}

export default function DeleteGalleryModal({
  open,
  galleryTitle,
  onClose,
  onDelete,
}: DeleteGalleryModalProps) {
  const [loading, setLoading] = useState<"gallery" | "files" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (deleteFiles: boolean) => {
    setError(null);
    setLoading(deleteFiles ? "files" : "gallery");
    try {
      await onDelete({ deleteFiles });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete gallery");
    } finally {
      setLoading(null);
    }
  };

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-gallery-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/70"
        aria-hidden
        onClick={loading ? undefined : onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3
            id="delete-gallery-modal-title"
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            Delete gallery
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={!!loading}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            How would you like to delete &quot;{galleryTitle}&quot;?
          </p>

          <div className="mb-4 space-y-3">
            <button
              type="button"
              onClick={() => handleDelete(false)}
              disabled={!!loading}
              className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Folder className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block font-medium text-neutral-900 dark:text-white">
                  Delete gallery only
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                  Removes the gallery. Files in Gallery Media/{galleryTitle} stay in place.
                </span>
              </div>
              {loading === "gallery" && (
                <span className="shrink-0 text-xs text-neutral-500">Deleting…</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleDelete(true)}
              disabled={!!loading}
              className="flex w-full items-start gap-3 rounded-lg border border-red-200 p-4 text-left transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/30 dark:hover:bg-red-950/30"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                <FolderMinus className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block font-medium text-neutral-900 dark:text-white">
                  Delete gallery &amp; files
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                  Removes the gallery and moves all associated files to Deleted files.
                </span>
              </div>
              {loading === "files" && (
                <span className="shrink-0 text-xs text-neutral-500">Deleting…</span>
              )}
            </button>
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={!!loading}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
