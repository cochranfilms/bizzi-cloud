"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X, Building2, Mail, FolderOpen, FileIcon, ArrowRight, Users } from "lucide-react";

export interface ShareConfirmationSourceWorkspace {
  title: string;
  detail?: string;
}

export interface ShareConfirmationTarget {
  mode: "email" | "workspace";
  emails: string[];
  workspaceLabel?: string;
  workspaceScopeLabel?: string;
  workspaceKind?: "personal_team" | "enterprise_workspace";
  workspaceLogoUrl?: string | null;
}

export interface ShareConfirmationSharedItems {
  shareName: string;
  folderOrSingleName: string;
  fileNames: string[];
  extraFileCount: number;
  isFolderShare: boolean;
  /** When names could not be loaded, show this count instead of a list */
  fileCountFallback?: number;
}

interface ShareConfirmationModalProps {
  open: boolean;
  onDismiss: () => void;
  source: ShareConfirmationSourceWorkspace;
  target: ShareConfirmationTarget;
  items: ShareConfirmationSharedItems;
}

function ConfirmWorkspaceAvatar({
  logoUrl,
  kind,
}: {
  logoUrl: string | null | undefined;
  kind: "personal_team" | "enterprise_workspace" | undefined;
}) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(logoUrl && !broken);
  if (showImg) {
    return (
      <img
        src={logoUrl as string}
        alt=""
        className="mt-0.5 h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-neutral-200 dark:ring-neutral-600"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-600"
      aria-hidden
    >
      {kind === "enterprise_workspace" ? (
        <Building2 className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
      ) : (
        <Users className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
      )}
    </div>
  );
}

export default function ShareConfirmationModal({
  open,
  onDismiss,
  source,
  target,
  items,
}: ShareConfirmationModalProps) {
  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-confirm-title"
    >
      <div
        className="flex min-h-full items-center justify-center px-4 pt-[max(3rem,calc(1.25rem+env(safe-area-inset-top,0px)))] pb-[max(3rem,calc(1.25rem+env(safe-area-inset-bottom,0px)))] sm:px-6 sm:pt-14 sm:pb-14 md:pt-16 md:pb-16"
        onClick={onDismiss}
      >
        <div
          className="relative z-10 my-auto w-full max-w-lg flex-col rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-700">
            <div className="flex gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/50"
                aria-hidden
              >
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3
                  id="share-confirm-title"
                  className="text-lg font-semibold text-neutral-900 dark:text-white"
                >
                  Share confirmed
                </h3>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Recipients will see this share in their Shared area (and get notified when
                  applicable).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            <section
              className="rounded-xl border border-neutral-200 bg-neutral-50/80 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/40"
              aria-label="Workspaces"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Workspace flow
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2.5 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-600">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Shared from
                  </p>
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                    {source.title}
                  </p>
                  {source.detail ? (
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {source.detail}
                    </p>
                  ) : null}
                </div>
                <ArrowRight
                  className="hidden h-5 w-5 shrink-0 text-neutral-400 sm:block"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2.5 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-600">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Shared to
                  </p>
                  {target.mode === "workspace" ? (
                    <div className="flex items-start gap-2.5">
                      <ConfirmWorkspaceAvatar
                        logoUrl={target.workspaceLogoUrl}
                        kind={target.workspaceKind}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                          {target.workspaceLabel ?? "Workspace"}
                        </p>
                        {target.workspaceScopeLabel ? (
                          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {target.workspaceScopeLabel}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : target.emails.length > 0 ? (
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {target.emails.length} email{target.emails.length === 1 ? "" : "s"}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      Link only (no invited emails yet)
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section aria-label="Recipients">
              <p className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {target.mode === "workspace" ? "Workspace audience" : "People with access"}
              </p>
              {target.mode === "workspace" ? (
                <div className="flex items-start gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
                  <ConfirmWorkspaceAvatar
                    logoUrl={target.workspaceLogoUrl}
                    kind={target.workspaceKind}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-800 dark:text-neutral-200">
                      Members of{" "}
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {target.workspaceLabel ?? "the selected workspace"}
                      </span>{" "}
                      who can receive shares will see this content.
                    </p>
                  </div>
                </div>
              ) : target.emails.length > 0 ? (
                <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
                  {target.emails.map((em) => (
                    <li
                      key={em}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-800 dark:text-neutral-200"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-neutral-400" />
                      {em}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  No individual emails were added. You can still copy the share link from the share
                  panel anytime.
                </p>
              )}
            </section>

            <section aria-label="Shared items">
              <p className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                What was shared
              </p>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700">
                <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Share name</p>
                  <p className="font-medium text-neutral-900 dark:text-white">{items.shareName}</p>
                </div>
                <div className="px-3 py-2">
                  {items.isFolderShare && items.fileNames.length === 0 ? (
                    <div className="flex items-start gap-2 py-1">
                      <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">
                        Folder <span className="font-medium">&quot;{items.folderOrSingleName}&quot;</span>
                      </span>
                    </div>
                  ) : items.fileNames.length === 0 &&
                    items.fileCountFallback &&
                    items.fileCountFallback > 0 ? (
                    <p className="py-1 text-sm text-neutral-800 dark:text-neutral-200">
                      <span className="font-medium">{items.fileCountFallback}</span> file
                      {items.fileCountFallback === 1 ? "" : "s"} included in this share
                    </p>
                  ) : items.fileNames.length === 0 ? (
                    <div className="flex items-start gap-2 py-1">
                      <FileIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">
                        <span className="font-medium">&quot;{items.folderOrSingleName}&quot;</span>
                      </span>
                    </div>
                  ) : (
                    <ul className="max-h-48 space-y-1 overflow-y-auto py-1">
                      {items.fileNames.map((name, idx) => (
                        <li
                          key={`${idx}:${name}`}
                          className="flex items-start gap-2 text-sm text-neutral-800 dark:text-neutral-200"
                        >
                          <FileIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                          <span className="min-w-0 break-words">{name}</span>
                        </li>
                      ))}
                      {items.extraFileCount > 0 ? (
                        <li className="pl-6 text-xs text-neutral-500 dark:text-neutral-400">
                          and {items.extraFileCount} more file{items.extraFileCount === 1 ? "" : "s"}
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="flex shrink-0 justify-end border-t border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-700">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
