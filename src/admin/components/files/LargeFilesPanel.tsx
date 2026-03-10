"use client";

import Link from "next/link";
import type { AdminFile } from "@/admin/types/adminFiles.types";
import { formatBytes } from "@/admin/utils/formatBytes";

interface LargeFilesPanelProps {
  files: AdminFile[];
}

export default function LargeFilesPanel({ files }: LargeFilesPanelProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Largest files
        </h4>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No large files (&gt;500MB) found
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Largest files
      </h4>
      <ul className="space-y-2">
        {files.slice(0, 8).map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 dark:border-neutral-700"
          >
            <span className="truncate text-sm font-medium">{f.name}</span>
            <span className="shrink-0 text-sm text-neutral-500">
              {formatBytes(f.sizeBytes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
