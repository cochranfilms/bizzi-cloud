"use client";

import type { UploadFailureReason } from "@/admin/types/adminUploads.types";

interface UploadFailuresPanelProps {
  failures: UploadFailureReason[];
}

export default function UploadFailuresPanel({ failures }: UploadFailuresPanelProps) {
  if (failures.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          Failure reasons
        </h4>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No failure data
        </p>
      </div>
    );
  }

  const total = failures.reduce((s, f) => s + f.count, 0);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        Most common failure reasons
      </h4>
      <ul className="space-y-3">
        {failures.map((f) => (
          <li key={f.reason} className="flex items-center justify-between gap-4">
            <span className="text-sm">{f.reason}</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${(f.count / total) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right text-sm text-neutral-500">
                {f.count}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
