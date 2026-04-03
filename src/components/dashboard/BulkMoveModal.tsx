"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LinkedDrive } from "@/types/backup";
import StorageFolderTreePickerModal from "./StorageFolderTreePickerModal";

interface BulkMoveModalProps {
  open: boolean;
  onClose: () => void;
  selectedFileCount: number;
  selectedFolderCount: number;
  /** Drive IDs to exclude (e.g. selected folder drives - can't move into self) */
  excludeDriveIds: string[];
  folders: LinkedDrive[];
  /** Cross-drive / linked-folder destination (v1-style) */
  onMove: (targetDriveId: string) => Promise<void>;
  /**
   * When set, user can choose to move files within the current Storage v2 drive.
   * Only pass when selection is files-only, single linked_drive_id, and context is v2 Storage.
   */
  v2IntraDrive?: {
    linkedDriveId: string;
    driveLabel: string;
    onMoveToFolder: (targetFolderId: string | null) => Promise<void>;
  };
}

type DestMode = "other_drive" | "v2_storage";

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
  const [destMode, setDestMode] = useState<DestMode>("other_drive");
  const [v2Pick, setV2Pick] = useState<string | null | undefined>(undefined);
  const [treeOpen, setTreeOpen] = useState(false);

  const excludeSet = new Set(excludeDriveIds);
  const availableFolders = folders.filter((f) => !excludeSet.has(f.id));
  const canChooseV2 = Boolean(v2IntraDrive);

  useEffect(() => {
    if (!open) return;
    setTargetId(availableFolders[0]?.id ?? "");
    setError(null);
    setDestMode(canChooseV2 ? "v2_storage" : "other_drive");
    setV2Pick(undefined);
    setTreeOpen(false);
    // Reset when modal opens / v2 option appears — not on every folders array identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- availableFolders is derived fresh each render
  }, [open, canChooseV2]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (canChooseV2 && destMode === "v2_storage" && v2IntraDrive) {
        if (v2Pick === undefined) {
          setError("Choose a folder in Storage, or pick drive root.");
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
        setError("Please select a folder");
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
    [canChooseV2, destMode, v2IntraDrive, v2Pick, targetId, onMove, onClose]
  );

  if (!open) return null;

  const total = selectedFileCount + selectedFolderCount;
  const parts: string[] = [];
  if (selectedFileCount > 0) parts.push(`${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`);
  if (selectedFolderCount > 0) parts.push(`${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"}`);
  const label = parts.length > 0 ? parts.join(", ") : `${total} item${total === 1 ? "" : "s"}`;

  const otherDriveDisabled =
    loading || availableFolders.length === 0 || (canChooseV2 && destMode === "v2_storage");
  const v2SubmitDisabled =
    loading || !canChooseV2 || destMode !== "v2_storage" || v2Pick === undefined;

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
          {canChooseV2 ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-neutral-800 dark:text-neutral-200">Destination</p>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="bulk-move-dest"
                  checked={destMode === "v2_storage"}
                  onChange={() => {
                    setDestMode("v2_storage");
                    setError(null);
                  }}
                />
                <span className="text-neutral-700 dark:text-neutral-300">
                  A folder in this Storage drive
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="bulk-move-dest"
                  checked={destMode === "other_drive"}
                  onChange={() => {
                    setDestMode("other_drive");
                    setError(null);
                  }}
                />
                <span className="text-neutral-700 dark:text-neutral-300">
                  Another linked folder (drive)
                </span>
              </label>
            </div>
          ) : null}

          {canChooseV2 && destMode === "v2_storage" && v2IntraDrive ? (
            <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
              <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
                {v2Pick === undefined
                  ? "No destination selected yet."
                  : v2Pick === null
                    ? "Drive root (top level of this Storage)."
                    : `Folder id: ${v2Pick}`}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => setTreeOpen(true)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700/80"
              >
                Choose folder…
              </button>
            </div>
          ) : null}

          {(!canChooseV2 || destMode === "other_drive") && (
          <div>
            <label htmlFor="bulk-move-target" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Linked folder
            </label>
            <select
              id="bulk-move-target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={otherDriveDisabled}
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
                canChooseV2 && destMode === "v2_storage"
                  ? v2SubmitDisabled
                  : loading || availableFolders.length === 0
              }
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {loading ? "Moving…" : "Move"}
            </button>
          </div>
        </form>
      </div>
      {v2IntraDrive ? (
        <StorageFolderTreePickerModal
          open={treeOpen}
          onClose={() => setTreeOpen(false)}
          linkedDriveId={v2IntraDrive.linkedDriveId}
          driveLabel={v2IntraDrive.driveLabel}
          title="Choose destination folder"
          confirmLabel="Select"
          excludedFolderIds={[]}
          onConfirm={async (targetParentFolderId) => {
            setV2Pick(targetParentFolderId);
            setTreeOpen(false);
          }}
        />
      ) : null}
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
