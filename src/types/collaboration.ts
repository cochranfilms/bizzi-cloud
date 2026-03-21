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
  | "gallery_invite";

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
  } | null;
}

export interface Comment {
  id: string;
  fileId: string;
  parentCommentId: string | null;
  authorUserId: string;
  body: string;
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
