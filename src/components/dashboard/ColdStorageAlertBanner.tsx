"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useColdStorageStatus } from "@/hooks/useColdStorageStatus";

export function ColdStorageAlertBanner() {
  const {
    hasColdStorage,
    expiresAt,
    daysRemaining,
    restoreUrl,
    billingStatus,
    orgName,
    informationalMessage,
    canRestoreContainer,
    containerType,
    recoveryRole,
    loading,
  } = useColdStorageStatus();

  if (loading || !hasColdStorage) return null;

  const isPastDue = billingStatus === "past_due";
  const isInformational =
    informationalMessage &&
    (canRestoreContainer === false || recoveryRole === "org_member" || recoveryRole === "team_member");
  const showRestoreCta =
    canRestoreContainer !== false && !!restoreUrl && !isInformational;

  const expiresStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const mainCopy = isInformational
    ? "Recovery storage is active for a workspace you were part of."
    : isPastDue
      ? "Your account is past due. Your files are protected in recovery storage."
      : "Your files are in recovery storage.";

  const dateCopy = expiresStr
    ? containerType === "organization" && orgName
      ? `Files for ${orgName} are protected until ${expiresStr}. `
      : containerType === "personal_team"
        ? `Team workspace files are protected until ${expiresStr}. `
        : `Your files are protected until ${expiresStr}. `
    : "";

  const ctaCopy = isInformational
    ? ""
    : isPastDue
      ? "Pay your invoice to restore full access."
      : "Complete billing to restore full access.";

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            {mainCopy}
          </p>
          {daysRemaining != null && (
            <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-100">
              {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
          {dateCopy}
          {informationalMessage ? (
            <span className="block font-medium">{informationalMessage}</span>
          ) : (
            ctaCopy
          )}
        </p>
        {showRestoreCta ? (
          restoreUrl!.startsWith("http") ? (
            <a
              href={restoreUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:no-underline dark:text-amber-300"
            >
              {isPastDue ? "Pay unpaid invoice" : "Restore now"} →
            </a>
          ) : (
            <Link
              href={restoreUrl!}
              className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:no-underline dark:text-amber-300"
            >
              {isPastDue ? "Pay unpaid invoice" : "Restore now"} →
            </Link>
          )
        ) : isInformational ? null : (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Contact support to restore your {orgName ? "organization" : "account"}.
          </p>
        )}
      </div>
    </div>
  );
}
