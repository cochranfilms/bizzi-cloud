"use client";

import { ImageIcon } from "lucide-react";
import { isRawFile } from "@/lib/gallery-file-types";

interface RawPreviewPlaceholderProps {
  fileName: string;
  className?: string;
}

/** Shown when a RAW file has no raster preview (replaces grey JPEGs). */
export default function RawPreviewPlaceholder({
  fileName,
  className = "",
}: RawPreviewPlaceholderProps) {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext =
    dot >= 0 ? lower.slice(dot + 1).toUpperCase() : "RAW";
  const showRawBadge = isRawFile(fileName);

  return (
    <div
      className={`flex min-h-[120px] w-full flex-col items-center justify-center gap-2 bg-neutral-200/90 px-3 py-6 text-center dark:bg-neutral-700/90 ${className}`}
    >
      <ImageIcon className="h-10 w-10 text-neutral-500 dark:text-neutral-400" />
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="rounded bg-neutral-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-neutral-600">
          RAW
        </span>
        {showRawBadge && (
          <span className="rounded border border-neutral-500/60 px-2 py-0.5 text-[10px] font-medium uppercase text-neutral-700 dark:text-neutral-200">
            {ext}
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
        Preview unavailable
      </p>
      <p className="max-w-[14rem] text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
        This file is stored correctly, but a preview is not available for this format yet.
      </p>
      <p className="truncate text-[10px] text-neutral-500 dark:text-neutral-500" title={fileName}>
        {fileName}
      </p>
    </div>
  );
}
