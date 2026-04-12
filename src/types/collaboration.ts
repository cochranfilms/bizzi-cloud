/**
 * Collaboration types: comments, hearts, notifications, file shares.
 * Used by backup_files (cloud storage) and sharing flows.
 */

export type NotificationType =
  | "file_comment_created"
  | "file_comment_edited"
  | "file_hearted"
  | "file_shared"
  | "file_reply_created"
  | "transfer_sent"
  | "gallery_invite"
  | "org_seat_invite"
  | "personal_team_added"
  | "personal_team_invited"
  | "personal_team_joined_owner"
  | "personal_team_you_were_removed"
  | "personal_team_workspace_closed_member"
  | "personal_team_workspace_closed_owner"
  | "personal_team_member_left_owner"
  | "org_member_joined"
  | "org_you_were_removed"
  | "org_role_changed"
  | "org_storage_quota_changed"
  | "org_removal_scheduled"
  | "gallery_proofing_comment"
  | "gallery_favorites_submitted"
  | "gallery_proofing_status_updated"
  | "share_invitee_removed"
  | "share_link_deleted"
  | "share_permission_downgraded"
  | "workspace_share_delivery_request"
  | "transfer_deleted_by_sender"
  | "transfer_expiring_soon"
  | "billing_payment_failed"
  | "billing_subscription_canceled"
  | "billing_subscription_welcome"
  | "lifecycle_storage_purged"
  | "support_ticket_submitted"
  | "support_ticket_in_progress"
  | "support_ticket_resolved";

export interface Notification {
  id: string;
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  fileId: string | null;
  commentId: string | null;
  shareId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata: {
    fileName?: string;
    folderName?: string;
    actorDisplayName?: string;
    fileCount?: number;
    parentCommentId?: string;
    transferSlug?: string;
    transferName?: string;
    galleryId?: string;
    galleryTitle?: string;
    orgId?: string;
    orgName?: string;
    inviteToken?: string;
    teamOwnerUserId?: string;
    newMemberDisplayName?: string;
    newRole?: string;
    storageQuotaSummary?: string;
    removalDeadline?: string;
    clientName?: string;
    clientEmail?: string;
    proofingStatus?: string;
    unpaidInvoiceUrl?: string;
    planName?: string;
    ticketId?: string;
    /** cold-storage purge: org | personal_team */
    purgeScope?: string;
    supportSubject?: string;
    /** billing: consumer profile vs org subscription */
    billingScope?: "consumer" | "org";
    /** Workspace-targeted share: human name for inbox copy */
    workspaceShareName?: string;
    workspaceTargetKey?: string;
    shareToken?: string;
    /** Where members see the share (personal team Shared vs enterprise Shared) */
    shareInboxScopeLabel?: string;
    /** Where the content lives (personal vs org private drive), to disambiguate for admins */
    shareSourceLabel?: string;
    /** Enterprise workspace shares: org id for notification routing */
    targetOrganizationId?: string;
    /** Personal team workspace closed by owner */
    teamWorkspaceName?: string;
  } | null;
}

export type FileCommentWorkspaceType = "personal" | "team" | "organization";
export type FileCommentVisibilityScope = "owner_only" | "collaborators" | "share_recipient";

export interface Comment {
  id: string;
  fileId: string;
  parentCommentId: string | null;
  authorUserId: string;
  /** Denormalized at write; GET may hydrate from profiles if missing. */
  authorDisplayName?: string | null;
  authorEmail?: string | null;
  /** From Firebase Auth / denormalized on write; GET may hydrate via Admin Auth if missing. */
  authorPhotoURL?: string | null;
  authorRoleSnapshot?: string | null;
  workspace_type?: FileCommentWorkspaceType | null;
  workspace_id?: string | null;
  visibility_scope?: FileCommentVisibilityScope | null;
  body: string;
  /** Seconds into the file’s video when the comment was composed (immersive video preview). */
  videoTimestampSec?: number | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Heart {
  id: string;
  fileId: string;
  userId: string;
  createdAt: string;
}

export interface FileShareRecipient {
  id: string;
  fileId: string;
  sharedByUserId: string;
  sharedWithUserId: string;
  permissionLevel: "view" | "edit";
  createdAt: string;
  folderShareId?: string;
}

/** For future notification preferences (mute hearts, comments, etc.) */
export interface NotificationPreferences {
  mutedCommentNotifications?: boolean;
  mutedHeartNotifications?: boolean;
  mutedShareNotifications?: boolean;
}
