"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ImageIcon } from "lucide-react";
import { useGalleries } from "@/hooks/useGalleries";

interface GalleryPickerModalProps {
  open: boolean;
  onClose: () => void;
  files: File[];
  onPick: (galleryId: string, galleryTitle: string) => void;
}

export default function GalleryPickerModal({
  open,
  onClose,
  files,
  onPick,
}: GalleryPickerModalProps) {
  const { galleries, loading } = useGalleries();
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPicked(null);
  }, [open]);

  if (!open) return null;

  const handlePick = (id: string, title: string) => {
    setPicked(id);
    onPick(id, title);
    onClose();
  };

  const fileCount = files.length;
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-picker-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3
            id="gallery-picker-modal-title"
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            Add to gallery
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Choose a gallery for {fileLabel}. Files will go into Gallery Media/
            <span className="font-medium text-neutral-900 dark:text-white">
              [Gallery Name]
            </span>
            /
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
            </div>
          ) : galleries.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No galleries yet. Create one from the Galleries page first.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {galleries.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(g.id, g.title)}
                    disabled={!!picked}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:opacity-70 dark:hover:bg-neutral-800"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-200 dark:bg-neutral-700">
                      <ImageIcon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-neutral-900 dark:text-white">
                        {g.title}
                      </span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {g.cover_asset_id ? "Has cover" : "No cover"} · {g.view_count} views
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-neutral-200 p-4 dark:border-neutral-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
