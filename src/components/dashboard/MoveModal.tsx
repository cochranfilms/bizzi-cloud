"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Folder } from "lucide-react";
import type { LinkedDrive } from "@/types/backup";

interface MoveModalProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemType: "file" | "folder";
  /** When moving a folder, its drive ID to exclude from targets */
  excludeDriveId?: string;
  folders: LinkedDrive[];
  onMove: (targetDriveId: string) => Promise<void>;
}

export default function MoveModal({
  open,
  onClose,
  itemName,
  itemType,
  excludeDriveId,
  folders,
  onMove,
}: MoveModalProps) {
  const [targetId, setTargetId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableFolders = folders.filter((f) => f.id !== excludeDriveId);

  useEffect(() => {
    if (open) {
      setTargetId(availableFolders[0]?.id ?? "");
      setError(null);
    }
  }, [open, availableFolders]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!targetId) {
        setError("Please select a folder");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await onMove(targetId);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move");
      } finally {
        setLoading(false);
      }
    },
    [targetId, onMove, onClose]
  );

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 id="move-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
            Move {itemType}
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
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Move &quot;{itemName}&quot; to:
          </p>
          <div>
            <label htmlFor="move-target" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Folder
            </label>
            <select
              id="move-target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={loading || availableFolders.length === 0}
            >
              {availableFolders.length === 0 ? (
                <option value="">No folders available</option>
              ) : (
                availableFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))
              )}
            </select>
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
              disabled={loading || availableFolders.length === 0}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {loading ? "Moving…" : "Move"}
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
