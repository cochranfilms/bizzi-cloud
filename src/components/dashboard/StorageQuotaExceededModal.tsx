"use client";

import { createPortal } from "react-dom";
import { X, HardDrive, ArrowUpCircle } from "lucide-react";

interface StorageQuotaExceededModalProps {
  open: boolean;
  onClose: () => void;
  /** Total bytes the user tried to upload */
  attemptedBytes: number;
  /** Current storage used (bytes) */
  usedBytes: number;
  /** Storage quota (bytes), null = unlimited */
  quotaBytes: number | null;
  /** True if user is in an organization (show org-specific message) */
  isOrganizationUser: boolean;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function StorageQuotaExceededModal({
  open,
  onClose,
  attemptedBytes,
  usedBytes,
  quotaBytes,
  isOrganizationUser,
}: StorageQuotaExceededModalProps) {
  if (!open) return null;

  const quotaLabel = quotaBytes === null ? "Unlimited" : formatBytes(quotaBytes);
  const usedLabel = formatBytes(usedBytes);
  const attemptedLabel = formatBytes(attemptedBytes);
  const remaining = quotaBytes === null ? Infinity : Math.max(0, quotaBytes - usedBytes);

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-quota-modal-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-amber-200/50 bg-gradient-to-b from-amber-50/95 to-white shadow-2xl dark:border-amber-800/50 dark:from-amber-950/95 dark:to-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-100/30 via-transparent to-transparent dark:from-amber-900/20" />
        <div className="relative p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50">
              <HardDrive className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <h3
            id="storage-quota-modal-title"
            className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white"
          >
            Storage limit reached
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            This upload ({attemptedLabel}) would exceed your remaining storage. You&apos;re using{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{usedLabel}</span> of{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{quotaLabel}</span>
            {remaining < Infinity && (
              <> ({formatBytes(remaining)} remaining)</>
            )}.
          </p>
          <div className="flex gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
            <ArrowUpCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {isOrganizationUser
                ? "Reach out to your organization owner to upgrade your storage allocation."
                : "Upgrade your storage plan to add more space."}
            </p>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
