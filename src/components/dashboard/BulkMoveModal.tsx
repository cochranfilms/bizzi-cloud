"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LinkedDrive } from "@/types/backup";
import StorageIntraDriveDestinationTree from "./StorageIntraDriveDestinationTree";

interface BulkMoveModalProps {
  open: boolean;
  onClose: () => void;
  selectedFileCount: number;
  selectedFolderCount: number;
  /** Drive IDs to exclude (e.g. selected folder drives - can't move into self) */
  excludeDriveIds: string[];
  folders: LinkedDrive[];
  /** Cross-drive / linked-folder destination when intra-drive move is not available */
  onMove: (targetDriveId: string) => Promise<void>;
  /**
   * When set, user moves files within the current Storage v2 drive only (Main storage + folders on that drive).
   */
  v2IntraDrive?: {
    linkedDriveId: string;
    driveLabel: string;
    onMoveToFolder: (targetFolderId: string | null) => Promise<void>;
    /** When every selected file is already under this folder, that row is disabled */
    currentParentFolderId?: string | null;
  };
}

export default function BulkMoveModal({
  open,
  onClose,
  selectedFileCount,
  selectedFolderCount,
  excludeDriveIds,
  folders,
  onMove,
  v2IntraDrive,
}: BulkMoveModalProps) {
  const [targetId, setTargetId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v2Pick, setV2Pick] = useState<string | null | undefined>(undefined);

  const excludeSet = useMemo(() => new Set(excludeDriveIds), [excludeDriveIds]);
  const availableFolders = useMemo(
    () => folders.filter((f) => !excludeSet.has(f.id)),
    [folders, excludeSet]
  );
  const isV2Only = Boolean(v2IntraDrive);

  useEffect(() => {
    if (!open) return;
    setTargetId(availableFolders[0]?.id ?? "");
    setError(null);
    setV2Pick(undefined);
  }, [open, isV2Only, availableFolders]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (v2IntraDrive && isV2Only) {
        if (v2Pick === undefined) {
          setError("Choose Main storage or a folder.");
          return;
        }
        setLoading(true);
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
        setError("Please select a destination");
        return;
      }
      setLoading(true);
      try {
        await onMove(targetId);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move");
      } finally {
        setLoading(false);
      }
    },
    [v2IntraDrive, isV2Only, v2Pick, targetId, onMove, onClose]
  );

  if (!open) return null;

  const total = selectedFileCount + selectedFolderCount;
  const parts: string[] = [];
  if (selectedFileCount > 0) parts.push(`${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`);
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;

  const crossDriveDisabled = loading || availableFolders.length === 0;
  const v2SubmitDisabled = loading || v2Pick === undefined;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-move-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 id="bulk-move-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
            Move items
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
            Move {label} to:
          </p>

          {isV2Only && v2IntraDrive ? (
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Pick Main storage (top level) or a folder on this drive. Subfolders load when you expand.
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
                excludedFolderIds={[]}
                currentParentFolderId={v2IntraDrive.currentParentFolderId}
                disabled={loading}
                preloadRootChildren
              />
            </>
          ) : null}

          {!isV2Only && (
            <div>
              <label
                htmlFor="bulk-move-target"
                className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Destination folder
              </label>
              <select
                id="bulk-move-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                disabled={crossDriveDisabled}
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
                Other backup folders you&apos;ve connected (for example Gallery or Creator drives).
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
              disabled={isV2Only ? v2SubmitDisabled : crossDriveDisabled}
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
