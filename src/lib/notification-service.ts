import type { NotificationType } from "@/types/collaboration";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { formatNotificationMessage } from "./notification-format";
import { getFileDisplayName } from "./file-access";

export interface CreateNotificationInput {
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  fileId?: string | null;
  commentId?: string | null;
  shareId?: string | null;
  metadata?: {
    fileName?: string;
    actorDisplayName?: string;
    fileCount?: number;
    parentCommentId?: string;
  };
}

/** Never notify the actor for their own action. */
export function shouldNotify(recipientUserId: string, actorUserId: string): boolean {
  return recipientUserId !== actorUserId && recipientUserId.length > 0;
}

/**
 * Create a notification. Call from comment API, heart API, shares API.
 * Deduplication: optional - caller can pass a dedupeKey to avoid rapid duplicates.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  if (!shouldNotify(input.recipientUserId, input.actorUserId)) return null;

  const db = getAdminFirestore();
  const now = new Date();

  let fileName = input.metadata?.fileName;
  if (!fileName && input.fileId) {
    fileName = await getFileDisplayName(input.fileId);
  }

  const actorDisplayName = input.metadata?.actorDisplayName ?? "Someone";
  const metadata = {
    ...(input.metadata ?? {}),
    fileName: fileName ?? input.metadata?.fileName,
    actorDisplayName,
  };

  const message = formatNotificationMessage(input.type, actorDisplayName, metadata);

  const doc = await db.collection("notifications").add({
    recipientUserId: input.recipientUserId,
    actorUserId: input.actorUserId,
    type: input.type,
    fileId: input.fileId ?? null,
    commentId: input.commentId ?? null,
    shareId: input.shareId ?? null,
    message,
    isRead: false,
    createdAt: now,
    metadata,
  });

  return doc.id;
}

/**
 * Create share notifications for recipients when files are shared.
 * Resolves invited emails to user IDs via profiles.
 */
export async function createShareNotifications(params: {
  sharedByUserId: string;
  actorDisplayName: string;
  fileIds: string[];
  folderShareId: string;
  permission: string;
  invitedEmails: string[];
  /** For folder shares (no fileIds), use this in the message */
  folderName?: string;
}): Promise<void> {
  const db = getAdminFirestore();
  const { sharedByUserId, actorDisplayName, fileIds, folderShareId, permission, invitedEmails, folderName } =
    params;

  if (invitedEmails.length === 0) return;

  const emailLower = invitedEmails.map((e) => e?.toLowerCase?.() ?? "").filter(Boolean);
  if (emailLower.length === 0) return;

  const profilesSnap = await db.collection("profiles").get();
  const emailToUid = new Map<string, string>();
  for (const d of profilesSnap.docs) {
    const email = (d.data()?.email as string)?.toLowerCase?.();
    if (email && emailLower.includes(email)) {
      emailToUid.set(email, d.id);
    }
  }

  const recipientUids = [...new Set(emailToUid.values())].filter((uid) => uid !== sharedByUserId);
  if (recipientUids.length === 0) return;

  const fileCount = fileIds.length;
  const fileName =
    fileCount === 1 && fileIds[0] ? await getFileDisplayName(fileIds[0]) : undefined;
  const message =
    fileCount > 1
      ? `${actorDisplayName} shared ${fileCount} files with you`
      : fileCount === 1 && fileName
        ? `${actorDisplayName} shared ${fileName} with you`
        : folderName
          ? `${actorDisplayName} shared ${folderName} with you`
          : `${actorDisplayName} shared files with you`;

  const now = new Date();
  const batch = db.batch();
  for (const uid of recipientUids) {
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      recipientUserId: uid,
      actorUserId: sharedByUserId,
      type: "file_shared",
      fileId: fileIds[0] ?? null,
      commentId: null,
      shareId: folderShareId,
      message,
      isRead: false,
      createdAt: now,
      metadata: {
        fileName,
        actorDisplayName,
        fileCount: fileCount > 1 ? fileCount : undefined,
      },
    });
  }
  await batch.commit();
}
