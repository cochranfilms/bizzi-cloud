"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Heart,
  Share2,
  FileText,
  Images,
  Users,
  UserPlus,
  Building2,
  CreditCard,
  LifeBuoy,
  Clock,
  Ban,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/hooks/useNotifications";
import { getAuthToken } from "@/lib/auth-token";
import { useAuth } from "@/context/AuthContext";
import type { Notification } from "@/types/collaboration";
import { supportSettingsHelpHref } from "@/lib/support-ticket";
import { parseWorkspaceTargetKey } from "@/lib/workspace-share-target-key";

interface NotificationCenterProps {
  onClose: () => void;
  onRefreshBadge?: () => void;
  routing: string;
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "file_comment_created":
    case "file_comment_edited":
    case "file_reply_created":
    case "gallery_proofing_comment":
      return <MessageSquare className="h-4 w-4 flex-shrink-0" />;
    case "file_hearted":
      return <Heart className="h-4 w-4 flex-shrink-0" />;
    case "file_shared":
    case "workspace_share_delivery_request":
    case "transfer_sent":
    case "share_invitee_removed":
    case "share_link_deleted":
    case "share_permission_downgraded":
      return <Share2 className="h-4 w-4 flex-shrink-0" />;
    case "gallery_invite":
    case "gallery_favorites_submitted":
    case "gallery_proofing_status_updated":
      return <Images className="h-4 w-4 flex-shrink-0" />;
    case "org_seat_invite":
    case "org_member_joined":
    case "org_you_were_removed":
    case "org_role_changed":
    case "org_storage_quota_changed":
    case "org_removal_scheduled":
      return <Building2 className="h-4 w-4 flex-shrink-0" />;
    case "personal_team_added":
    case "personal_team_invited":
    case "personal_team_joined_owner":
    case "personal_team_you_were_removed":
    case "personal_team_member_left_owner":
      return <UserPlus className="h-4 w-4 flex-shrink-0" />;
    case "transfer_deleted_by_sender":
    case "transfer_expiring_soon":
      return <Clock className="h-4 w-4 flex-shrink-0" />;
    case "billing_payment_failed":
    case "billing_subscription_canceled":
    case "billing_subscription_welcome":
      return <CreditCard className="h-4 w-4 flex-shrink-0" />;
    case "lifecycle_storage_purged":
      return <Ban className="h-4 w-4 flex-shrink-0" />;
    case "support_ticket_submitted":
    case "support_ticket_in_progress":
    case "support_ticket_resolved":
      return <LifeBuoy className="h-4 w-4 flex-shrink-0" />;
    default:
      return <FileText className="h-4 w-4 flex-shrink-0" />;
  }
}

function resolveNotificationHref(n: Notification, shareBasePath: string): string {
  const m = n.metadata ?? {};
  if (n.shareId) {
    if (
      (n.type === "file_shared" || n.type === "workspace_share_delivery_request") &&
      typeof m.workspaceTargetKey === "string"
    ) {
      const target = parseWorkspaceTargetKey(m.workspaceTargetKey);
      if (target?.kind === "personal_team") {
        return `/team/${target.id}/shared/${n.shareId}`;
      }
      if (target?.kind === "enterprise_workspace") {
        return `/enterprise/shared/${n.shareId}`;
      }
    }
    return `${shareBasePath}/shared/${n.shareId}`;
  }
  if (n.fileId) {
    return n.commentId
      ? `${shareBasePath}?file=${n.fileId}#comment-${n.commentId}`
      : `${shareBasePath}?file=${n.fileId}`;
  }

  if (n.type === "transfer_deleted_by_sender") {
    return `${shareBasePath}/transfers`;
  }

  if (
    (n.type === "transfer_sent" || n.type === "transfer_expiring_soon") &&
    m.transferSlug
  ) {
    return `/t/${m.transferSlug}`;
  }

  if (
    (n.type === "gallery_invite" || n.type === "gallery_proofing_status_updated") &&
    m.galleryId
  ) {
    return `/g/${m.galleryId}`;
  }

  if (
    (n.type === "gallery_proofing_comment" || n.type === "gallery_favorites_submitted") &&
    m.galleryId
  ) {
    return `${shareBasePath}/galleries/${m.galleryId}/proofing`;
  }

  if (n.type === "org_seat_invite" && m.inviteToken) {
    return `/invite/join?token=${encodeURIComponent(m.inviteToken)}`;
  }

  if (n.type === "personal_team_added" && m.teamOwnerUserId) {
    return `/team/${m.teamOwnerUserId}`;
  }

  const orgBillingTypes: Notification["type"][] = [
    "org_member_joined",
    "org_you_were_removed",
    "org_role_changed",
    "org_storage_quota_changed",
    "org_removal_scheduled",
  ];
  if (orgBillingTypes.includes(n.type)) {
    return "/enterprise/settings";
  }

  if (
    n.type === "billing_payment_failed" ||
    n.type === "billing_subscription_canceled" ||
    n.type === "billing_subscription_welcome"
  ) {
    if (m.orgId || m.billingScope === "org") {
      return "/enterprise/settings";
    }
    return "/dashboard/settings";
  }

  if (
    n.type === "share_invitee_removed" ||
    n.type === "share_link_deleted" ||
    n.type === "share_permission_downgraded"
  ) {
    return `${shareBasePath}/shared`;
  }

  if (n.type === "lifecycle_storage_purged") {
    return shareBasePath === "/enterprise" ? "/enterprise" : "/dashboard";
  }

  if (
    n.type === "support_ticket_submitted" ||
    n.type === "support_ticket_in_progress" ||
    n.type === "support_ticket_resolved"
  ) {
    return supportSettingsHelpHref(shareBasePath, n.type);
  }

  return "/dashboard";
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
  const href = resolveNotificationHref(n, shareBasePath);

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
  routing,
}: NotificationCenterProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const teamBaseFromPath = pathname?.match(/^\/team\/([^/]+)/)?.[1];
  const shareBasePath = pathname?.startsWith("/enterprise")
    ? "/enterprise"
    : pathname?.startsWith("/desktop")
      ? "/desktop/app"
      : teamBaseFromPath
        ? `/team/${teamBaseFromPath}`
        : "/dashboard";
  const {
    notifications,
    loading,
    hasMore,
    loadMore,
    refresh,
  } = useNotifications({ limit: 15, routing });

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
