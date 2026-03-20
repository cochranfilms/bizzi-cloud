import type { NotificationType } from "@/types/collaboration";
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
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
  const rawMetadata = {
    ...(input.metadata ?? {}),
    fileName: fileName ?? input.metadata?.fileName,
    actorDisplayName,
  };
  // Firestore rejects undefined; omit undefined values
  const metadata = Object.fromEntries(
    Object.entries(rawMetadata).filter(([, v]) => v !== undefined)
  );

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
  /** When set, used in message: "email has sent you..." instead of "Someone shared..." */
  actorEmail?: string;
  fileIds: string[];
  folderShareId: string;
  permission: string;
  invitedEmails: string[];
  /** For folder shares (no fileIds), use this in the message */
  folderName?: string;
}): Promise<void> {
  const db = getAdminFirestore();
  const { sharedByUserId, actorDisplayName, actorEmail, fileIds, folderShareId, permission, invitedEmails, folderName } =
    params;

  if (invitedEmails.length === 0) return;

  const emailLower = invitedEmails.map((e) => e?.toLowerCase?.() ?? "").filter(Boolean);
  if (emailLower.length === 0) return;

  const recipientUids: string[] = [];
  const auth = getAdminAuth();
  for (const inviteEmail of emailLower) {
    try {
      const userRecord = await auth.getUserByEmail(inviteEmail);
      if (userRecord?.uid && userRecord.uid !== sharedByUserId) {
        recipientUids.push(userRecord.uid);
      }
    } catch {
      // User not found by email (no Firebase account yet) – skip
    }
  }
  if (recipientUids.length === 0) return;

  const actor = actorEmail ?? actorDisplayName;
  const verb = actorEmail ? "has sent you" : "shared";
  const fileCount = fileIds.length;
  const fileName =
    fileCount === 1 && fileIds[0] ? await getFileDisplayName(fileIds[0]) : undefined;
  const message =
    fileCount > 1
      ? `${actor} ${verb} ${fileCount} files`
      : folderName
        ? `${actor} ${verb} ${folderName}`
        : fileCount === 1 && fileName
          ? `${actor} ${verb} ${fileName}`
          : `${actor} ${verb} files`;

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
      metadata: Object.fromEntries(
        Object.entries({
          fileName,
          folderName,
          actorDisplayName,
          fileCount: fileCount > 1 ? fileCount : undefined,
        }).filter(([, v]) => v !== undefined)
      ),
    });
  }
  await batch.commit();
}
