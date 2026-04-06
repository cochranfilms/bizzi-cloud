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
  /** Sent tab: replaces “Shared by …” (e.g. shared-with list / workspace name) */
  recipientSummary?: string;
  /** Sent tab: underlying file or folder name when it differs from the share title */
  backingCaption?: string;
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

const cardShellClassName =
  "group relative flex min-w-0 w-full max-w-full flex-col items-stretch overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 pt-7 transition-colors hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50";

/** Non-interactive card copy/art so the stretched Link receives clicks (children do not inherit pointer-events). */
const PE_NONE = "pointer-events-none";

function CardChrome({
  item,
  isOwned,
  hrefOverlay,
  body,
  ownedStrip,
}: {
  item: SharedItem;
  isOwned?: boolean;
  hrefOverlay?: string;
  body: React.ReactNode;
  ownedStrip?: React.ReactNode;
}) {
  const dest = item.shareDestination;
  const pendingDelivery = item.workspaceDeliveryStatus === "pending";

  return (
    <div className={cardShellClassName}>
      {dest && (
        <span
          className="pointer-events-none absolute right-2 top-2 z-40 rounded border bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide shadow-sm dark:bg-neutral-900/95"
          style={{
            color: "var(--bizzi-accent)",
            borderColor: "var(--bizzi-accent)",
          }}
        >
          {dest === "team" ? "Team" : "Organization"}
        </span>
      )}
      {isOwned && pendingDelivery && (
        <span className="pointer-events-none absolute left-2 top-2 z-40 max-w-[min(100%,calc(100%-1rem))] truncate rounded border border-amber-500/50 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
          Pending approval
        </span>
      )}
      <div className="relative z-0 flex w-full min-w-0 flex-col items-center">{body}</div>
      {hrefOverlay ? (
        <Link
          href={hrefOverlay}
          className="absolute inset-0 z-[10] rounded-xl outline-offset-2"
          aria-label={`Open shared ${item.type}: ${item.name}`}
        />
      ) : null}
      {hrefOverlay && ownedStrip ? (
        <div className="pointer-events-auto absolute left-6 right-6 top-[6.5rem] z-30 flex w-[calc(100%-3rem)] min-w-0 max-w-full flex-wrap items-center justify-center gap-2 px-0.5">
          {ownedStrip}
        </div>
      ) : null}
    </div>
  );
}

export default function SharedItemCard({
  item,
  isOwned,
  onDelete,
  onEdit,
  onApproveWorkspaceShare,
  onDenyWorkspaceShare,
  workspaceModerationLoading,
}: SharedItemCardProps) {
  const pendingDelivery = item.workspaceDeliveryStatus === "pending";
  const showModeration =
    pendingDelivery && !isOwned && onApproveWorkspaceShare && onDenyWorkspaceShare;

  const hrefOverlay = item.href ? item.href : undefined;

  const ownedActionsInner =
    isOwned && (onEdit || onDelete) ? (
      <>
        {onEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(e);
            }}
            className="inline-flex min-w-0 max-w-full shrink items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm hover:border-bizzi-blue/40 hover:bg-bizzi-blue/10 hover:text-bizzi-blue dark:border-neutral-600 dark:bg-neutral-900/95 dark:text-neutral-200 dark:hover:border-bizzi-blue/50 dark:hover:bg-bizzi-blue/15 dark:hover:text-bizzi-cyan"
            aria-label="Manage share"
          >
            <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">Manage share</span>
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(e);
            }}
            className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            aria-label="Delete share"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </>
    ) : null;

  /** Space for absolutely positioned owner actions (below icon: pt-7 + h-16 + mb-3). */
  const ownedFlowSpacer = ownedActionsInner ? <div className="mb-3 h-9 w-full shrink-0" aria-hidden /> : null;

  const sharedTextBlock = (
    <>
      <h3
        className={`mb-1 w-full min-w-0 truncate text-center text-sm font-medium text-neutral-900 dark:text-white ${PE_NONE}`}
        title={item.name}
      >
        {item.name}
      </h3>

      {item.items != null && item.type === "folder" ? (
        <p
          className={`mb-0.5 w-full min-w-0 truncate text-center text-xs text-neutral-500 dark:text-neutral-400 ${PE_NONE}`}
        >
          {item.items} {item.items === 1 ? "file" : "files"}
        </p>
      ) : null}

      {isOwned && item.backingCaption ? (
        <p
          className={`mb-0.5 w-full min-w-0 truncate text-center text-[11px] text-neutral-400 dark:text-neutral-500 ${PE_NONE}`}
          title={item.backingCaption}
        >
          {item.backingCaption}
        </p>
      ) : null}

      <p
        className={`mb-2 w-full min-w-0 truncate text-center text-xs text-neutral-500 dark:text-neutral-400 ${PE_NONE}`}
        title={item.recipientSummary ?? `Shared by ${item.sharedBy}`}
      >
        {item.recipientSummary ?? `Shared by ${item.sharedBy}`}
      </p>

      <div className={`flex w-full justify-center px-0.5 ${PE_NONE}`}>
        <span
          className={`inline-flex max-w-full min-w-0 justify-center truncate rounded-full px-2 py-0.5 text-center text-xs font-medium ${
            item.permission === "edit"
              ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
          }`}
        >
          {item.permission === "edit" ? "Download" : "View only"}
        </span>
      </div>
    </>
  );

  const iconBlock = (
    <div
      className={`mb-3 flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20 ${PE_NONE}`}
    >
      {item.type === "folder" ? (
        <Folder className="h-10 w-10 shrink-0" aria-hidden />
      ) : (
        <File className="h-8 w-8 shrink-0" aria-hidden />
      )}
    </div>
  );

  const cardBodyWithLink = (
    <>
      {iconBlock}
      {ownedFlowSpacer}
      {sharedTextBlock}
    </>
  );

  const cardBodyNoLink = (
    <>
      {iconBlock}
      {ownedActionsInner ? (
        <div className="relative z-0 mb-3 flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-2 px-0.5">
          {ownedActionsInner}
        </div>
      ) : null}
      {sharedTextBlock}
    </>
  );

  if (item.href) {
    if (showModeration) {
      return (
        <div className="flex min-w-0 flex-col gap-2">
          <CardChrome
            item={item}
            isOwned={isOwned}
            hrefOverlay={hrefOverlay}
            body={cardBodyWithLink}
            ownedStrip={ownedActionsInner}
          />
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
      <CardChrome
        item={item}
        isOwned={isOwned}
        hrefOverlay={hrefOverlay}
        body={cardBodyWithLink}
        ownedStrip={ownedActionsInner}
      />
    );
  }

  return <CardChrome item={item} isOwned={isOwned} body={cardBodyNoLink} />;
}
