"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LayoutGrid, List, Folder, File, Trash2, Send, Inbox, Settings } from "lucide-react";
import SharedItemCard, { type SharedItem } from "./SharedItemCard";
import SharerCard, { type SharerCardItem } from "./SharerCard";
import SectionTitle from "./SectionTitle";
import ShareModal from "./ShareModal";
import { useShares, type SharesListQuery } from "@/hooks/useShares";
import DashboardRouteFade from "./DashboardRouteFade";
import { useConfirm } from "@/hooks/useConfirm";
import { usePathname } from "next/navigation";
import { useEnterprise } from "@/context/EnterpriseContext";
import type { ShareListItem } from "@/hooks/useShares";

function formatSentShareRecipientSummary(s: {
  recipient_mode?: string;
  invited_emails?: string[];
  workspace_display_name?: string;
  workspace_target?: { kind: string; id: string };
}): string {
  if (s.recipient_mode === "workspace") {
    const name = s.workspace_display_name?.trim();
    const kind = s.workspace_target?.kind;
    const scope =
      kind === "personal_team"
        ? "Personal team"
        : kind === "enterprise_workspace"
          ? "Organization workspace"
          : null;
    if (name && scope) return `Shared with ${name} · ${scope}`;
    if (name) return `Shared with ${name}`;
    if (scope) return `Shared with ${scope}`;
    return "Shared with workspace";
  }
  const emails = [
    ...new Set(
      (s.invited_emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean)
    ),
  ];
  if (emails.length === 1) return `Shared with ${emails[0]}`;
  if (emails.length > 1) return `Shared with ${emails[0]} +${emails.length - 1} more`;
  return "Shared by link";
}

function sentShareBackingCaption(s: ShareListItem): string | undefined {
  const custom = s.share_label?.trim();
  const backing = s.backing_item_name?.trim();
  if (!custom || !backing || custom === backing) return undefined;
  return backing;
}

export default function SharedGrid() {
  const pathname = usePathname() ?? "";
  const { org } = useEnterprise();
  const { user } = useAuth();
  const [workspaceModerationLoadingToken, setWorkspaceModerationLoadingToken] = useState<
    string | null
  >(null);

  const sharesListQuery = useMemo<SharesListQuery | null>(() => {
    const teamMatch = pathname.match(/^\/team\/([^/]+)/);
    if (teamMatch?.[1]) {
      return {
        context: "workspace",
        workspace_kind: "personal_team",
        workspace_id: teamMatch[1],
      };
    }
    if (pathname.startsWith("/enterprise")) {
      if (org?.id) {
        return { context: "workspace", organization_id: org.id };
      }
      return { context: "workspace" };
    }
    return { context: "personal" };
  }, [pathname, org?.id]);

  const { owned, invited, loading, error, deleteShare, refetch } = useShares(sharesListQuery);
  /** In-app share folder viewer URL — keep team / enterprise / desktop shell (avoid /s → dashboard jump). */
  const shareViewerHref = useCallback((token: string) => {
    const enc = encodeURIComponent(token);
    const teamMatch = pathname.match(/^\/team\/([^/]+)/);
    if (teamMatch?.[1]) return `/team/${teamMatch[1]}/shared/${enc}`;
    if (pathname.startsWith("/enterprise")) return `/enterprise/shared/${enc}`;
    if (pathname.startsWith("/desktop/app")) return `/desktop/app/shared/${enc}`;
    return `/dashboard/shared/${enc}`;
  }, [pathname]);
  const { confirm } = useConfirm();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sentReceivedFilter, setSentReceivedFilter] = useState<"all" | "sent" | "received">("all");
  const [filter, setFilter] = useState<"all" | "folders" | "files">("all");
  const [editShare, setEditShare] = useState<{ token: string; folderName: string; invitedEmails?: string[] } | null>(null);

  type FlatItem = SharedItem & { token: string; isOwned?: boolean };

  const invitedItemsWithSharer = useMemo(() => {
    return invited.map((s) => ({
      name: s.folder_name,
      type: s.item_type,
      key: s.token,
      token: s.token,
      sharedBy: s.sharedBy ?? "Someone",
      permission: s.permission,
      href: shareViewerHref(s.token),
      isOwned: false as const,
      owner_id: s.owner_id,
      sharedByEmail: s.sharedByEmail,
      sharedByPhotoUrl: s.sharedByPhotoUrl,
      workspaceDeliveryStatus: s.workspace_delivery_status ?? null,
    }));
  }, [invited, shareViewerHref]);

  const ownedItems: (FlatItem & { invitedEmails?: string[] })[] = useMemo(() => {
    return owned.map((s) => ({
      name: s.folder_name,
      type: s.item_type,
      key: s.token,
      token: s.token,
      sharedBy: "You",
      permission: s.permission,
      href: shareViewerHref(s.token),
      isOwned: true as const,
      invitedEmails: s.invited_emails,
      shareDestination: s.share_destination,
      workspaceDeliveryStatus: s.workspace_delivery_status ?? null,
      recipientSummary: formatSentShareRecipientSummary(s),
      backingCaption: sentShareBackingCaption(s),
    }));
  }, [owned, shareViewerHref]);

  const sharers = useMemo(() => {
    const byOwner = new Map<
      string,
      { ownerId: string; displayName: string; email: string; photoUrl: string | null; items: SharerCardItem[] }
    >();
    for (const item of invitedItemsWithSharer) {
      const ownerId = item.owner_id ?? `unknown-${item.sharedBy}`;
      const passesFilter =
        filter === "all" || item.type === (filter === "folders" ? "folder" : "file");
      if (!passesFilter) continue;
      const sharerItem: SharerCardItem = {
        ...item,
        token: item.token,
      };
      const existing = byOwner.get(ownerId);
      if (existing) {
        existing.items.push(sharerItem);
      } else {
        byOwner.set(ownerId, {
          ownerId,
          displayName: item.sharedBy ?? "Unknown",
          email: item.sharedByEmail ?? "",
          photoUrl: item.sharedByPhotoUrl ?? null,
          items: [sharerItem],
        });
      }
    }
    return Array.from(byOwner.values()).sort((a, b) =>
      a.email.localeCompare(b.email, "en", { sensitivity: "base" })
    );
  }, [invitedItemsWithSharer, filter]);

  const filteredOwnedItems = useMemo(() => {
    return ownedItems.filter(
      (item) => filter === "all" || item.type === (filter === "folders" ? "folder" : "file")
    );
  }, [ownedItems, filter]);

  const hasReceivedContent = sharers.length > 0;
  const hasSentContent = filteredOwnedItems.length > 0;
  const isEmpty =
    sentReceivedFilter === "received"
      ? !hasReceivedContent
      : sentReceivedFilter === "sent"
        ? !hasSentContent
        : !hasReceivedContent && !hasSentContent;

  const handleWorkspaceDeliveryModeration = useCallback(
    async (shareToken: string, action: "approve" | "reject") => {
      if (!user) return;
      const ok =
        action === "reject"
          ? await confirm({
              message:
                "Reject this share? It will not appear for your team until you receive a new share request.",
              destructive: true,
              confirmLabel: "Deny access",
            })
          : true;
      if (!ok) return;
      setWorkspaceModerationLoadingToken(shareToken);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(
          `/api/shares/${encodeURIComponent(shareToken)}/workspace-delivery`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data.error as string) ?? "Could not update share");
        }
        await refetch();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setWorkspaceModerationLoadingToken(null);
      }
    },
    [user, confirm, refetch]
  );

  const handleDeleteShare = useCallback(
    async (e: React.MouseEvent, token: string, name: string) => {
      e.preventDefault();
      e.stopPropagation();
      const ok = await confirm({
        message: `Remove share "${name}"? People with the link will no longer have access. Your original files will not be deleted.`,
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteShare(token);
      } catch (err) {
        console.error("Delete share failed:", err);
      }
    },
    [deleteShare, confirm]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Filter tabs + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          {/* Sent vs Received */}
          <div className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setSentReceivedFilter("all")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                sentReceivedFilter === "all"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSentReceivedFilter("sent")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                sentReceivedFilter === "sent"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              <Send className="h-4 w-4" />
              Sent
            </button>
            <button
              type="button"
              onClick={() => setSentReceivedFilter("received")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                sentReceivedFilter === "received"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              <Inbox className="h-4 w-4" />
              Received
            </button>
          </div>
          {/* Type filter: All / Folders / Files */}
          <div className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                filter === "all"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter("folders")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                filter === "folders"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              <Folder className="h-4 w-4" />
              Folders
            </button>
            <button
              type="button"
              onClick={() => setFilter("files")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              filter === "files"
                ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
            >
              <File className="h-4 w-4" />
              Files
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`rounded p-2 ${
              viewMode === "grid"
                ? "bg-neutral-200 text-bizzi-blue dark:bg-neutral-700"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded p-2 ${
              viewMode === "list"
                ? "bg-neutral-200 text-bizzi-blue dark:bg-neutral-700"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 py-8 text-center dark:border-red-800 dark:bg-red-950/50">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : (
      <DashboardRouteFade ready={!loading} srOnlyMessage="Loading shares">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 dark:border-neutral-700">
          <Folder className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
          <p className="mb-1 text-lg font-medium text-neutral-700 dark:text-neutral-300">
            No{" "}
            {sentReceivedFilter === "sent"
              ? "sent"
              : sentReceivedFilter === "received"
                ? "received"
                : "shared"}{" "}
            {filter === "all" ? "items" : filter} yet
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {sentReceivedFilter === "received"
              ? "When someone shares a file or folder with you, it will appear here."
              : sentReceivedFilter === "sent"
                ? "Shares you create will appear here when you share files or folders with others."
                : "When someone shares a file or folder with you, or when you share with others, it will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Received: Sharer cards (when showing received or all) */}
          {(sentReceivedFilter === "received" || sentReceivedFilter === "all") &&
            hasReceivedContent && (
              <section>
                {sentReceivedFilter === "all" && (
                  <SectionTitle className="mb-4">Shared with you</SectionTitle>
                )}
                <div className="space-y-6">
                  {sharers.map((sharer) => (
                    <SharerCard
                      key={sharer.ownerId}
                      ownerId={sharer.ownerId}
                      displayName={sharer.displayName}
                      email={sharer.email || undefined}
                      photoUrl={sharer.photoUrl}
                      items={sharer.items}
                      viewMode={viewMode}
                      onApproveWorkspaceShare={(t) =>
                        void handleWorkspaceDeliveryModeration(t, "approve")
                      }
                      onDenyWorkspaceShare={(t) =>
                        void handleWorkspaceDeliveryModeration(t, "reject")
                      }
                      workspaceModerationLoadingToken={workspaceModerationLoadingToken}
                    />
                  ))}
                </div>
              </section>
            )}

          {/* Sent: Owned items (when showing sent or all) */}
          {(sentReceivedFilter === "sent" || sentReceivedFilter === "all") &&
            hasSentContent && (
              <section>
                {sentReceivedFilter === "all" && (
                  <SectionTitle className="mb-4">Shared by you</SectionTitle>
                )}
                {viewMode === "grid" ? (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
                    {filteredOwnedItems.map((item) => (
                      <SharedItemCard
                        key={item.key}
                        item={{
                          name: item.name,
                          type: item.type,
                          key: item.key,
                          sharedBy: item.sharedBy,
                          permission: item.permission,
                          href: item.href,
                          shareDestination: item.shareDestination,
                          workspaceDeliveryStatus: item.workspaceDeliveryStatus,
                          recipientSummary: item.recipientSummary,
                          backingCaption: item.backingCaption,
                        }}
                        isOwned
                        onEdit={(e) => (
                          e.preventDefault(),
                          e.stopPropagation(),
                          setEditShare({
                            token: item.token,
                            folderName: item.name,
                            invitedEmails: item.invitedEmails,
                          })
                        )}
                        onDelete={(e) =>
                          handleDeleteShare(e, item.token, item.name)
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                    {filteredOwnedItems.map((item, i) => {
                      const rowContent = (
                        <div
                          className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
                            i > 0
                              ? "border-t border-neutral-200 dark:border-neutral-700"
                              : ""
                          }`}
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                            {item.type === "folder" ? (
                              <Folder className="h-5 w-5" />
                            ) : (
                              <File className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium text-neutral-900 dark:text-white">
                                {item.name}
                              </p>
                              {item.shareDestination && (
                                <span
                                  className="flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                  style={{
                                    color: "var(--bizzi-accent)",
                                    borderColor: "var(--bizzi-accent)",
                                  }}
                                >
                                  {item.shareDestination === "team"
                                    ? "Team"
                                    : "Organization"}
                                </span>
                              )}
                            </div>
                            {item.backingCaption ? (
                              <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                                {item.backingCaption}
                              </p>
                            ) : null}
                            <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                              {item.recipientSummary ?? `Shared by ${item.sharedBy}`} ·{" "}
                              {item.permission === "edit"
                                ? "Download"
                                : "View only"}
                            </p>
                          </div>
                          <span
                            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              item.permission === "edit"
                                ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
                                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                            }`}
                          >
                            {item.permission === "edit"
                              ? "Download"
                              : "View only"}
                          </span>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditShare({
                          token: item.token,
                          folderName: item.name,
                          invitedEmails: item.invitedEmails,
                        });
                      }}
                              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-bizzi-blue/40 hover:bg-bizzi-blue/10 hover:text-bizzi-blue dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-bizzi-blue/50 dark:hover:bg-bizzi-blue/15 dark:hover:text-bizzi-cyan"
                              aria-label="Manage share"
                            >
                              <Settings className="h-3.5 w-3.5 shrink-0" />
                              Manage share
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteShare(e, item.token, item.name);
                              }}
                              className="flex-shrink-0 rounded p-2 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                              aria-label="Delete share"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                      return item.href ? (
                        <Link href={item.href} key={item.key}>
                          {rowContent}
                        </Link>
                      ) : (
                        <div key={item.key}>{rowContent}</div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
        </div>
      )}
      </DashboardRouteFade>
      )}

      {editShare && (
        <ShareModal
          open={!!editShare}
          onClose={() => {
            setEditShare(null);
            refetch();
          }}
          folderName={editShare.folderName}
          initialShareToken={editShare.token}
          initialInvitedEmails={editShare.invitedEmails}
          manageExistingShare
        />
      )}
    </div>
  );
}
