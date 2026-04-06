"use client";

import Link from "next/link";
import { File, Folder, Trash2, Settings } from "lucide-react";

export interface SharedItem {
  name: string;
  type: "folder" | "file";
  key: string;
  sharedBy: string;
  permission: "view" | "edit";
  items?: number;
  modifiedAt?: string;
  /** When set, card links to this URL (e.g. share link) */
  href?: string;
  /** Team vs org workspace share — uses live --bizzi-accent */
  shareDestination?: "team" | "organization";
  /** From workspace-targeted shares API */
  workspaceDeliveryStatus?: string | null;
}

interface SharedItemCardProps {
  item: SharedItem;
  isOwned?: boolean;
  onDelete?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
  /** Workspace admin: pending cross-workspace delivery */
  onApproveWorkspaceShare?: () => void;
  onDenyWorkspaceShare?: () => void;
  workspaceModerationLoading?: boolean;
}

const cardClassName =
  "group relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 pt-7 transition-colors hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50";

export default function SharedItemCard({
  item,
  isOwned,
  onDelete,
  onEdit,
  onApproveWorkspaceShare,
  onDenyWorkspaceShare,
  workspaceModerationLoading,
}: SharedItemCardProps) {
  const dest = item.shareDestination;
  const pendingDelivery = item.workspaceDeliveryStatus === "pending";
  const showModeration =
    pendingDelivery && !isOwned && onApproveWorkspaceShare && onDenyWorkspaceShare;

  const content = (
    <>
      {dest && (
        <span
          className="pointer-events-none absolute right-2 top-2 z-10 rounded border bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide shadow-sm dark:bg-neutral-900/95"
          style={{
            color: "var(--bizzi-accent)",
            borderColor: "var(--bizzi-accent)",
          }}
        >
          {dest === "team" ? "Team" : "Organization"}
        </span>
      )}
      {isOwned && pendingDelivery && (
        <span className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] rounded border border-amber-500/50 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
          Pending approval
        </span>
      )}
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
        {item.type === "folder" ? (
          <Folder className="h-8 w-8" />
        ) : (
          <File className="h-8 w-8" />
        )}
      </div>
      <h3 className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white">
        {item.name}
      </h3>
      <p className="mb-0.5 truncate w-full text-center text-xs text-neutral-500 dark:text-neutral-400">
        Shared by {item.sharedBy}
      </p>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          item.permission === "edit"
            ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
        }`}
      >
        {item.permission === "edit" ? "Download" : "View only"}
      </span>
    </>
  );

  const cardContent = (
    <div className="relative">
      {content}
      {isOwned && (onEdit || onDelete) && (
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-3rem)] flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(e);
              }}
              className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm hover:border-bizzi-blue/40 hover:bg-bizzi-blue/10 hover:text-bizzi-blue dark:border-neutral-600 dark:bg-neutral-900/95 dark:text-neutral-200 dark:hover:border-bizzi-blue/50 dark:hover:bg-bizzi-blue/15 dark:hover:text-bizzi-cyan"
              aria-label="Manage share"
            >
              <Settings className="h-3.5 w-3.5" />
              Manage share
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(e);
              }}
              className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              aria-label="Delete share"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (item.href) {
    if (showModeration) {
      return (
        <div className="flex flex-col gap-2">
          <Link href={item.href} className={cardClassName}>
            {cardContent}
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={workspaceModerationLoading}
              onClick={() => onApproveWorkspaceShare()}
              className="rounded-lg bg-bizzi-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {workspaceModerationLoading ? "…" : "Approve for workspace"}
            </button>
            <button
              type="button"
              disabled={workspaceModerationLoading}
              onClick={() => onDenyWorkspaceShare()}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Deny
            </button>
          </div>
        </div>
      );
    }
    return (
      <Link href={item.href} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div
      className={cardClassName}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.preventDefault();
      }}
    >
      {cardContent}
    </div>
  );
}
