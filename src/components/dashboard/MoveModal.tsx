"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LinkedDrive } from "@/types/backup";
import StorageIntraDriveDestinationTree from "./StorageIntraDriveDestinationTree";

export type MoveModalV2IntraDrive = {
  linkedDriveId: string;
  driveLabel: string;
  onMoveToFolder: (targetFolderId: string | null) => Promise<void>;
  excludedFolderIds?: string[];
  knownDescendantIds?: string[];
  currentParentFolderId?: string | null;
};

interface MoveModalProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemType: "file" | "folder";
  /** When moving a legacy linked folder, its drive ID to exclude from targets */
  excludeDriveId?: string;
  folders: LinkedDrive[];
  /** Cross-drive move (required when `v2IntraDrive` is not set) */
  onMove?: (targetDriveId: string) => Promise<void>;
  /** Storage v2: move within this drive only (inline folder list) */
  v2IntraDrive?: MoveModalV2IntraDrive;
}

export default function MoveModal({
  open,
  onClose,
  itemName,
  itemType,
  excludeDriveId,
  folders,
  onMove,
  v2IntraDrive,
}: MoveModalProps) {
  const [targetId, setTargetId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v2Pick, setV2Pick] = useState<string | null | undefined>(undefined);

  const isV2 = Boolean(v2IntraDrive);
  const availableFolders = useMemo(
    () => folders.filter((f) => f.id !== excludeDriveId),
    [folders, excludeDriveId]
  );

  useEffect(() => {
    if (open) {
      setTargetId(availableFolders[0]?.id ?? "");
      setError(null);
      setV2Pick(undefined);
    }
  }, [open, availableFolders, isV2]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isV2 && v2IntraDrive) {
        if (v2Pick === undefined) {
          setError("Choose Main storage or a folder.");
          return;
        }
        setLoading(true);
        setError(null);
        try {
          await v2IntraDrive.onMoveToFolder(v2Pick);
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to move");
        } finally {
          setLoading(false);
        }
        return;
      }
      if (!targetId) {
        setError("Please select a folder");
        return;
      }
      if (!onMove) {
        setError("No move action available");
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
    [isV2, v2IntraDrive, v2Pick, targetId, onMove, onClose]
  );

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
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
            onClick={() => !loading && onClose()}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Move &quot;{itemName}&quot; to:
          </p>

          {isV2 && v2IntraDrive ? (
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Main storage or a folder on this drive. Expand a row to see subfolders.
              </p>
              <StorageIntraDriveDestinationTree
                key={`${v2IntraDrive.linkedDriveId}-${open}`}
                linkedDriveId={v2IntraDrive.linkedDriveId}
                driveLabel={v2IntraDrive.driveLabel}
                selectedParentId={v2Pick}
                onSelectParent={(id) => {
                  setV2Pick(id);
                  setError(null);
                }}
                excludedFolderIds={v2IntraDrive.excludedFolderIds ?? []}
                knownDescendantIds={v2IntraDrive.knownDescendantIds}
                currentParentFolderId={v2IntraDrive.currentParentFolderId}
                disabled={loading}
                preloadRootChildren
              />
            </>
          ) : (
            <div>
              <label
                htmlFor="move-target"
                className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Destination folder
              </label>
              <select
                id="move-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                disabled={loading || availableFolders.length === 0}
              >
                {availableFolders.length === 0 ? (
                  <option value="">No destinations available</option>
                ) : (
                  availableFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Other backup folders you&apos;ve connected.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => !loading && onClose()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isV2
                  ? loading || v2Pick === undefined
                  : loading || availableFolders.length === 0
              }
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {loading ? "Moving…" : "Move"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
