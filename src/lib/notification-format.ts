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

  switch (type) {
    case "file_comment_created":
      return `${actor} added a comment on ${fileName}`;
    case "file_comment_edited":
      return `${actor} edited a comment on this file`;
    case "file_reply_created":
      return `A reply was added to your comment on ${fileName}`;
    case "file_hearted":
      return `${actor} hearted your video`;
    case "file_shared":
      if (fileCount > 1) {
        return `${actor} shared ${fileCount} files with you`;
      }
      return `${actor} shared ${folderName ?? fileName} with you`;
    case "transfer_sent":
      if (fileCount > 1) {
        return `${actor} sent you a transfer with ${fileCount} files`;
      }
      return `${actor} sent you a transfer`;
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
