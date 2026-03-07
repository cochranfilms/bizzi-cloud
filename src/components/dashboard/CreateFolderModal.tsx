"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface CreateFolderModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided, creates folder and moves selected items into it */
  selectedFileIds?: string[];
  selectedFolderKeys?: string[];
  onCreateAndMove?: (folderName: string) => Promise<void>;
  /** When provided, just creates an empty folder */
  onCreateEmpty?: (folderName: string) => Promise<void>;
}

export default function CreateFolderModal({
  open,
  onClose,
  selectedFileIds = [],
  selectedFolderKeys = [],
  onCreateAndMove,
  onCreateEmpty,
}: CreateFolderModalProps) {
  const [name, setName] = useState("New folder");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = selectedFileIds.length > 0 || selectedFolderKeys.length > 0;
  const onSubmit = hasSelection ? onCreateAndMove : onCreateEmpty;

  useEffect(() => {
    if (open) {
      setName("New folder");
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Folder name cannot be empty");
        return;
      }
      if (!onSubmit) return;
      setLoading(true);
      setError(null);
      try {
        await onSubmit(trimmed);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create folder");
      } finally {
        setLoading(false);
      }
    },
    [name, onSubmit, onClose]
  );

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-folder-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 id="create-folder-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
            {hasSelection ? "Create folder and move items" : "Create new folder"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
          {hasSelection && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              A new folder will be created and the selected item(s) will be moved into it.
            </p>
          )}
          <div>
            <label htmlFor="folder-name" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Folder name
            </label>
            <input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              placeholder="New folder"
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {loading ? "Creating…" : hasSelection ? "Create & move" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
