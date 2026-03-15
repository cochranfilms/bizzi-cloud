"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Heart, Share2, FileText } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/hooks/useNotifications";
import { getAuthToken } from "@/lib/auth-token";
import { useAuth } from "@/context/AuthContext";
import type { Notification } from "@/types/collaboration";

interface NotificationCenterProps {
  onClose: () => void;
  onRefreshBadge?: () => void;
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "file_comment_created":
    case "file_comment_edited":
    case "file_reply_created":
      return <MessageSquare className="h-4 w-4 flex-shrink-0" />;
    case "file_hearted":
      return <Heart className="h-4 w-4 flex-shrink-0" />;
    case "file_shared":
      return <Share2 className="h-4 w-4 flex-shrink-0" />;
    default:
      return <FileText className="h-4 w-4 flex-shrink-0" />;
  }
}

function NotificationLink({
  n,
  onClick,
  shareBasePath,
}: {
  n: Notification;
  onClick: () => void;
  shareBasePath: string;
}) {
  const href = n.fileId
    ? n.commentId
      ? `/dashboard?file=${n.fileId}#comment-${n.commentId}`
      : `/dashboard?file=${n.fileId}`
    : n.shareId
      ? `${shareBasePath}/shared/${n.shareId}`
      : "/dashboard";

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
        !n.isRead ? "bg-bizzi-blue/5 dark:bg-bizzi-blue/10" : ""
      }`}
    >
      <div className="flex gap-2">
        <div
          className={`mt-0.5 ${
            !n.isRead
              ? "text-bizzi-blue dark:text-bizzi-cyan"
              : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          <NotificationIcon type={n.type} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-800 dark:text-neutral-200">
            {n.message}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {formatTimeAgo(n.createdAt)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationCenter({
  onClose,
  onRefreshBadge,
}: NotificationCenterProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const shareBasePath =
    pathname?.startsWith("/enterprise")
      ? "/enterprise"
      : pathname?.startsWith("/desktop")
        ? "/desktop/app"
        : "/dashboard";
  const {
    notifications,
    loading,
    hasMore,
    loadMore,
    refresh,
  } = useNotifications({ limit: 15 });

  const handleMarkRead = useCallback(
    async (id: string) => {
      const token = await getAuthToken(true);
      if (!token) return;
      await markNotificationRead(id, token);
      refresh();
      onRefreshBadge?.();
    },
    [refresh, onRefreshBadge]
  );

  const handleMarkAllRead = useCallback(async () => {
    const token = await getAuthToken(true);
    if (!token) return;
    await markAllNotificationsRead(token);
    refresh();
    onRefreshBadge?.();
  }, [refresh, onRefreshBadge]);

  if (!user) return null;

  return (
    <div className="absolute right-0 top-full z-[100] mt-1 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Activity
        </h3>
        {notifications.some((n) => !n.isRead) && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-bizzi-blue hover:underline dark:text-bizzi-cyan"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No notifications yet.
            </p>
          </div>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li key={n.id}>
                <NotificationLink
                  n={n}
                  shareBasePath={shareBasePath}
                  onClick={() => {
                    if (!n.isRead) handleMarkRead(n.id);
                    onClose();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {hasMore && notifications.length > 0 && (
          <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
            <button
              type="button"
              onClick={loadMore}
              className="w-full rounded-lg py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
