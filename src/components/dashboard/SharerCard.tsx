"use client";

import Image from "next/image";
import Link from "next/link";
import { File, Folder } from "lucide-react";
import SharedItemCard, { type SharedItem } from "./SharedItemCard";

export interface SharerCardItem extends SharedItem {
  token: string;
}

interface SharerCardProps {
  ownerId: string;
  displayName: string;
  email?: string;
  photoUrl?: string | null;
  items: SharerCardItem[];
  viewMode?: "grid" | "list";
  onApproveWorkspaceShare?: (token: string) => void;
  onDenyWorkspaceShare?: (token: string) => void;
  workspaceModerationLoadingToken?: string | null;
}

function getInitials(displayName: string, email?: string): string {
  if (displayName && displayName !== "Unknown") {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0]![0] + parts[1]![0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "?";
}

function SharerCardListRow({
  item,
  onApproveWorkspaceShare,
  onDenyWorkspaceShare,
  workspaceModerationLoading,
}: {
  item: SharerCardItem;
  onApproveWorkspaceShare?: (token: string) => void;
  onDenyWorkspaceShare?: (token: string) => void;
  workspaceModerationLoading?: boolean;
}) {
  const pendingDelivery = item.workspaceDeliveryStatus === "pending";
  const showMod =
    pendingDelivery && onApproveWorkspaceShare && onDenyWorkspaceShare;
  const rowContent = (
    <div className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
        {item.type === "folder" ? (
          <Folder className="h-6 w-6" />
        ) : (
          <File className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-neutral-900 dark:text-white">
          {item.name}
        </p>
        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
          {pendingDelivery ? "Awaiting your approval · " : ""}
          {item.permission === "edit" ? "Download" : "View only"}
        </p>
      </div>
      <span
        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          item.permission === "edit"
            ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
        }`}
      >
        {item.permission === "edit" ? "Download" : "View only"}
      </span>
    </div>
  );
  const modBar =
    showMod && item.href ? (
      <div className="flex flex-wrap gap-2 border-t border-neutral-200 px-4 py-2 dark:border-neutral-700">
        <button
          type="button"
          disabled={workspaceModerationLoading}
          onClick={(e) => {
            e.preventDefault();
            onApproveWorkspaceShare(item.token);
          }}
          className="rounded-lg bg-bizzi-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
        >
          {workspaceModerationLoading ? "…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={workspaceModerationLoading}
          onClick={(e) => {
            e.preventDefault();
            onDenyWorkspaceShare(item.token);
          }}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
        >
          Deny
        </button>
      </div>
    ) : null;
  return item.href ? (
    <div>
      <Link href={item.href}>{rowContent}</Link>
      {modBar}
    </div>
  ) : (
    <div>
      {rowContent}
      {modBar}
    </div>
  );
}

export default function SharerCard({
  ownerId,
  displayName,
  email,
  photoUrl,
  items,
  viewMode = "grid",
  onApproveWorkspaceShare,
  onDenyWorkspaceShare,
  workspaceModerationLoadingToken,
}: SharerCardProps) {
  const initials = getInitials(displayName, email ?? "");

  return (
    <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      {/* Sharer header */}
      <div className="flex items-center gap-4 border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20 dark:text-bizzi-cyan">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt=""
              width={48}
              height={48}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <span className="text-sm font-medium">{initials}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
            {email || displayName}
          </p>
        </div>
      </div>

      {/* Shared items */}
      <div className="p-4">
        {viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <SharedItemCard
                key={item.key}
                item={item}
                isOwned={false}
                onApproveWorkspaceShare={
                  item.workspaceDeliveryStatus === "pending" && onApproveWorkspaceShare
                    ? () => onApproveWorkspaceShare(item.token)
                    : undefined
                }
                onDenyWorkspaceShare={
                  item.workspaceDeliveryStatus === "pending" && onDenyWorkspaceShare
                    ? () => onDenyWorkspaceShare(item.token)
                    : undefined
                }
                workspaceModerationLoading={workspaceModerationLoadingToken === item.token}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
            {items.map((item, i) => (
              <div
                key={item.key}
                className={
                  i > 0 ? "border-t border-neutral-200 dark:border-neutral-700" : ""
                }
              >
                <SharerCardListRow
                  item={item}
                  onApproveWorkspaceShare={onApproveWorkspaceShare}
                  onDenyWorkspaceShare={onDenyWorkspaceShare}
                  workspaceModerationLoading={workspaceModerationLoadingToken === item.token}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
