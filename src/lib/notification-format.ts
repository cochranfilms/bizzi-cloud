import type { Notification, NotificationType } from "@/types/collaboration";

/**
 * Generate human-readable notification messages from notification data.
 * Used by API and frontend. Do not hardcode messages in UI.
 */
export function formatNotificationMessage(
  type: NotificationType,
  actorDisplayName: string,
  metadata: Notification["metadata"]
): string {
  const actor = actorDisplayName || "Someone";
  const fileName = metadata?.fileName ?? "your file";
  const folderName = metadata?.folderName;
  const fileCount = metadata?.fileCount ?? 1;
  const galleryTitle = metadata?.galleryTitle ?? "a gallery";
  const orgName = metadata?.orgName ?? "your organization";
  const clientLabel = metadata?.clientName?.trim() || metadata?.clientEmail?.trim() || "A client";

  switch (type) {
    case "file_comment_created":
      return `${actor} added a comment on ${fileName}`;
    case "file_comment_edited":
      return `${actor} edited a comment on this file`;
    case "file_reply_created":
      return `A reply was added to your comment on ${fileName}`;
    case "file_hearted":
      return `${actor} hearted your video`;
    case "file_shared": {
      const wsName = metadata?.workspaceShareName?.trim();
      const inbox = metadata?.shareInboxScopeLabel?.trim();
      const src = metadata?.shareSourceLabel?.trim();
      const itemLabel =
        fileCount > 1 ? `${fileCount} files` : folderName ?? fileName;
      if (wsName) {
        const parts = [`${actor} shared ${itemLabel} with ${wsName}`];
        if (inbox) parts.push(inbox);
        if (src) parts.push(src);
        return parts.join(" · ");
      }
      if (fileCount > 1) {
        return `${actor} shared ${fileCount} files with you`;
      }
      return `${actor} shared ${folderName ?? fileName} with you`;
    }
    case "workspace_share_delivery_request": {
      const wsName = metadata?.workspaceShareName?.trim() || "your workspace";
      const itemLabel =
        fileCount > 1 ? `${fileCount} files` : folderName ?? fileName;
      return `${actor} asked to deliver shared ${itemLabel} to ${wsName} — approve in Shared to show your team`;
    }
    case "transfer_sent":
      if (fileCount > 1) {
        return `${actor} sent you a transfer with ${fileCount} files`;
      }
      return `${actor} sent you a transfer`;
    case "gallery_invite": {
      const gTitle = metadata?.galleryTitle ?? "a gallery";
      return `${actor} invited you to view ${gTitle}`;
    }
    case "org_seat_invite": {
      const on = metadata?.orgName ?? "an organization";
      return `${actor} invited you to join ${on}`;
    }
    case "personal_team_added":
      return `${actor} added you to their team`;
    case "personal_team_invited":
      return `${actor} invited you to join their team — accept using the link in your email`;
    case "personal_team_joined_owner": {
      const joiner = metadata?.newMemberDisplayName ?? actor;
      return `${joiner} joined your team`;
    }
    case "personal_team_you_were_removed":
      return `You were removed from ${actor}'s team`;
    case "personal_team_workspace_closed_member": {
      const tw = metadata?.teamWorkspaceName?.trim();
      return tw
        ? `${actor} closed the team workspace “${tw}”. You no longer have access.`
        : `${actor} closed their team workspace. You no longer have access.`;
    }
    case "personal_team_workspace_closed_owner": {
      const tw = metadata?.teamWorkspaceName?.trim();
      return tw
        ? `You closed the team workspace “${tw}”. Your personal account stays active; team files are in the normal recovery lifecycle.`
        : `You closed your team workspace. Your personal account stays active; team files are in the normal recovery lifecycle.`;
    }
    case "personal_team_member_left_owner": {
      const leaver = metadata?.newMemberDisplayName ?? actor;
      return `${leaver} left your team`;
    }
    case "org_member_joined": {
      const who = metadata?.newMemberDisplayName ?? actor;
      return `${who} joined ${orgName}`;
    }
    case "org_you_were_removed":
      return `You were removed from ${orgName}`;
    case "org_role_changed": {
      const role = metadata?.newRole ?? "member";
      return `Your role in ${orgName} was updated to ${role}`;
    }
    case "org_storage_quota_changed": {
      const q = metadata?.storageQuotaSummary ?? "your storage allocation";
      return `Your storage allocation in ${orgName} was updated (${q})`;
    }
    case "org_removal_scheduled": {
      const when = metadata?.removalDeadline ?? "soon";
      return `${orgName} is scheduled for removal. Export data before ${when}.`;
    }
    case "gallery_proofing_comment":
      return `${clientLabel} commented on ${galleryTitle}`;
    case "gallery_favorites_submitted":
      return `${clientLabel} submitted favorites in ${galleryTitle}`;
    case "gallery_proofing_status_updated": {
      const st = metadata?.proofingStatus ?? "updated";
      return `${actor} updated proofing status to “${st}” in ${galleryTitle}`;
    }
    case "share_invitee_removed": {
      const folder = folderName ?? "a shared folder";
      return `You no longer have access to ${folder}`;
    }
    case "share_link_deleted": {
      const folder = folderName ?? "a shared item";
      return `${actor} removed the share link for ${folder}`;
    }
    case "share_permission_downgraded": {
      const folder = folderName ?? "a shared item";
      return `Your access to ${folder} was changed to view-only`;
    }
    case "transfer_deleted_by_sender":
      return `${actor} removed a transfer sent to you`;
    case "transfer_expiring_soon": {
      const tname = metadata?.transferName ?? "A transfer";
      return `${tname} expires soon`;
    }
    case "billing_payment_failed":
      return `Payment failed — update your billing details to avoid losing access`;
    case "billing_subscription_canceled":
      return metadata?.billingScope === "org"
        ? `Your organization subscription has ended`
        : `Your subscription has ended`;
    case "billing_subscription_welcome": {
      const plan = metadata?.planName ?? "your plan";
      return `Welcome! Your subscription to ${plan} is active`;
    }
    case "lifecycle_storage_purged":
      return metadata?.purgeScope === "org"
        ? `Cold storage for ${orgName} has been permanently purged`
        : `Your team cold storage retention period has ended and files were purged`;
    case "support_ticket_submitted": {
      const sub = metadata?.supportSubject ?? "your request";
      return `Support ticket received: ${sub}`;
    }
    case "support_ticket_in_progress": {
      const sub = metadata?.supportSubject ?? "your request";
      return `Support is now working on your ticket: ${sub}`;
    }
    case "support_ticket_resolved": {
      const sub = metadata?.supportSubject ?? "your request";
      return `Your support ticket was marked resolved: ${sub}`;
    }
    default:
      return "New activity";
  }
}

/**
 * Apply formatting to a notification object (e.g. from API).
 * Ensures message is set; if not, generates from type + metadata.
 */
export function ensureNotificationMessage(n: Notification): Notification {
  if (n.message && n.message.trim().length > 0) return n;
  const actor = n.metadata?.actorDisplayName ?? "Someone";
  const formatted = formatNotificationMessage(n.type, actor, n.metadata ?? {});
  return { ...n, message: formatted };
}
