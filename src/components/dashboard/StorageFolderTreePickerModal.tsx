"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import StorageIntraDriveDestinationTree from "./StorageIntraDriveDestinationTree";

export interface StorageFolderTreePickerModalProps {
  open: boolean;
  onClose: () => void;
  linkedDriveId: string;
  driveLabel: string;
  title: string;
  confirmLabel?: string;
  excludedFolderIds: string[];
  knownDescendantIds?: string[];
  onConfirm: (targetParentFolderId: string | null) => Promise<void>;
}

export default function StorageFolderTreePickerModal({
  open,
  onClose,
  linkedDriveId,
  driveLabel,
  title,
  confirmLabel = "Move here",
  excludedFolderIds,
  knownDescendantIds,
  onConfirm,
}: StorageFolderTreePickerModalProps) {
  /** `undefined` = none chosen; `null` = drive root */
  const [selectedParentId, setSelectedParentId] = useState<string | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedParentId(undefined);
      setError(null);
    }
  }, [open, linkedDriveId]);

  const handleConfirm = useCallback(async () => {
    if (selectedParentId === undefined) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedParentId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [selectedParentId, onConfirm, onClose]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-tree-picker-title"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 flex max-h-[min(85vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h3
            id="storage-tree-picker-title"
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <p className="mb-2 text-sm text-red-500 dark:text-red-400">{error}</p>
          ) : null}
          <StorageIntraDriveDestinationTree
            key={`${linkedDriveId}-${open}`}
            linkedDriveId={linkedDriveId}
            driveLabel={driveLabel}
            rootLabel="Main storage"
            selectedParentId={selectedParentId}
            onSelectParent={setSelectedParentId}
            excludedFolderIds={excludedFolderIds}
            knownDescendantIds={knownDescendantIds}
            disabled={submitting}
            preloadRootChildren
            listClassName="max-h-[min(60vh,20rem)] space-y-0.5 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/80 p-2 text-sm dark:border-neutral-600 dark:bg-neutral-800/50"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || selectedParentId === undefined}
            onClick={() => void handleConfirm()}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {submitting ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
