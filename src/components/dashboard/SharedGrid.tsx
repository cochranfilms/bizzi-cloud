"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Folder, File, Trash2, Send, Inbox, Settings } from "lucide-react";
import SharedItemCard, { type SharedItem } from "./SharedItemCard";
import SharerCard, { type SharerCardItem } from "./SharerCard";
import SectionTitle from "./SectionTitle";
import ShareModal from "./ShareModal";
import { useShares } from "@/hooks/useShares";
import DashboardRouteFade from "./DashboardRouteFade";
import { useConfirm } from "@/hooks/useConfirm";

export default function SharedGrid() {
  const { owned, invited, loading, error, deleteShare, refetch } = useShares();
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
      href: s.share_url,
      isOwned: false as const,
      owner_id: s.owner_id,
      sharedByEmail: s.sharedByEmail,
      sharedByPhotoUrl: s.sharedByPhotoUrl,
    }));
  }, [invited]);

  const ownedItems: (FlatItem & { invitedEmails?: string[] })[] = useMemo(() => {
    return owned.map((s) => ({
      name: s.folder_name,
      type: s.item_type,
      key: s.token,
      token: s.token,
      sharedBy: "You",
      permission: s.permission,
      href: s.share_url,
      isOwned: true as const,
      invitedEmails: s.invited_emails,
    }));
  }, [owned]);

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
                        item={item}
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
                            <p className="truncate font-medium text-neutral-900 dark:text-white">
                              {item.name}
                            </p>
                            <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                              Shared by {item.sharedBy} ·{" "}
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
                          <div className="flex gap-1">
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
                              className="flex-shrink-0 rounded p-2 text-neutral-400 transition-colors hover:bg-bizzi-blue/10 hover:text-bizzi-blue dark:hover:bg-bizzi-blue/20 dark:hover:text-bizzi-cyan"
                              aria-label="Edit share"
                            >
                              <Settings className="h-4 w-4" />
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
        />
      )}
    </div>
  );
}
