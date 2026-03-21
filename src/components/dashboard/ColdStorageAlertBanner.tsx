"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useColdStorageStatus } from "@/hooks/useColdStorageStatus";

export function ColdStorageAlertBanner() {
  const {
    hasColdStorage,
    expiresAt,
    restoreUrl,
    orgName,
    loading,
  } = useColdStorageStatus();

  if (loading || !hasColdStorage) return null;

  const expiresStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          Your files are in cold storage
        </p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
          {orgName
            ? `Files for ${orgName} will be permanently deleted on ${expiresStr ?? "the expiration date"}. `
            : expiresStr
              ? `They will be permanently deleted on ${expiresStr}. `
              : ""}
          Pay your subscription invoice to restore access to your files.
        </p>
        {restoreUrl ? (
          restoreUrl.startsWith("http") ? (
            <a
              href={restoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:no-underline dark:text-amber-300"
            >
              Restore now →
            </a>
          ) : (
            <Link
              href={restoreUrl}
              className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:no-underline dark:text-amber-300"
            >
              Restore now →
            </Link>
          )
        ) : (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Contact support to restore your {orgName ? "organization" : "account"}.
          </p>
        )}
      </div>
    </div>
  );
}
