import type { Notification, NotificationType } from "@/types/collaboration";
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { inferNotificationRoutingBucket } from "./notification-routing";
import { formatNotificationMessage } from "./notification-format";
import { getFileDisplayName } from "./file-access";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team-constants";
import type { Workspace } from "@/types/workspace";
import type { WorkspaceShareTargetKind } from "@/types/folder-share";
import { userCanAccessWorkspace } from "@/lib/workspace-access";

export type NotificationMetadata = NonNullable<Notification["metadata"]>;

export interface CreateNotificationInput {
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  fileId?: string | null;
  commentId?: string | null;
  shareId?: string | null;
  /** When true, deliver even if recipient === actor (billing, support ack, etc.). */
  allowSelfActor?: boolean;
  metadata?: NotificationMetadata;
}

/** Never notify the actor for their own action (unless allowSelfActor). */
export function shouldNotify(
  recipientUserId: string,
  actorUserId: string,
  allowSelfActor?: boolean
): boolean {
  if (!recipientUserId) return false;
  if (allowSelfActor) return true;
  return recipientUserId !== actorUserId;
}

/**
 * Create a notification. Call from comment API, heart API, shares API.
 * Deduplication: optional - caller can pass a dedupeKey to avoid rapid duplicates.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  if (!shouldNotify(input.recipientUserId, input.actorUserId, input.allowSelfActor)) return null;

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
  const metadata = Object.fromEntries(
    Object.entries(rawMetadata).filter(([, v]) => v !== undefined)
  ) as NotificationMetadata;

  const message = formatNotificationMessage(input.type, actorDisplayName, metadata);

  const routingBucket = inferNotificationRoutingBucket({
    type: input.type,
    metadata: metadata as Record<string, unknown>,
  });

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
    routingBucket,
    metadata,
  });

  return doc.id;
}

/** Resolve emails to Firebase user IDs for in-app delivery. */
export async function resolveEmailsToUserIds(
  emails: string[],
  excludeUserId?: string
): Promise<string[]> {
  const auth = getAdminAuth();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = raw?.toLowerCase?.()?.trim();
    if (!email?.includes("@")) continue;
    try {
      const rec = await auth.getUserByEmail(email);
      if (rec.uid && rec.uid !== excludeUserId && !seen.has(rec.uid)) {
        seen.add(rec.uid);
        out.push(rec.uid);
      }
    } catch {
      /* no user */
    }
  }
  return out;
}

/** Active org admins with a bound user account. */
export async function getOrganizationAdminUserIds(
  db: Firestore,
  orgId: string,
  excludeUserId?: string
): Promise<string[]> {
  const snap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of snap.docs) {
    const s = d.data();
    if (s.status !== "active" || s.role !== "admin") continue;
    const uid = typeof s.user_id === "string" ? s.user_id : "";
    if (!uid || uid === excludeUserId || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

/** Active org members (admin or member) with a bound user account. */
export async function getOrganizationActiveMemberUserIds(
  db: Firestore,
  orgId: string,
  excludeUserId?: string
): Promise<string[]> {
  const snap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of snap.docs) {
    const s = d.data();
    if (s.status !== "active") continue;
    const uid = typeof s.user_id === "string" ? s.user_id : "";
    if (!uid || uid === excludeUserId || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

export async function getActorDisplayName(db: Firestore, uid: string): Promise<string> {
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const data = profileSnap.data();
  const fromProfile =
    (data?.displayName as string | undefined)?.trim() ||
    (data?.display_name as string | undefined)?.trim();
  if (fromProfile) return fromProfile;
  try {
    const u = await getAdminAuth().getUser(uid);
    return (
      (u.displayName as string | undefined)?.trim() ||
      u.email?.split("@")[0] ||
      "Someone"
    );
  } catch {
    return "Someone";
  }
}

export function formatStorageQuotaSummary(bytes: number | null): string {
  if (bytes === null) return "Unlimited";
  if (bytes <= 0) return "0";
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${tb % 1 === 0 ? tb : tb.toFixed(1)} TB`;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.max(1, Math.round(mb))} MB`;
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
  const {
    sharedByUserId,
    actorDisplayName,
    actorEmail,
    fileIds,
    folderShareId,
    permission,
    invitedEmails,
    folderName,
  } = params;

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
      routingBucket: "consumer",
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

/**
 * User IDs that should receive in-app notifications for a workspace-targeted share
 * (all seats with access to that workspace, excluding the sharer).
 */
export async function getUserIdsForWorkspaceShareInbox(
  db: Firestore,
  kind: WorkspaceShareTargetKind,
  targetId: string,
  excludeUserId?: string
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (userId: string) => {
    if (!userId || userId === excludeUserId || seen.has(userId)) return;
    seen.add(userId);
    out.push(userId);
  };

  if (kind === "personal_team") {
    push(targetId);
    const snap = await db
      .collection(PERSONAL_TEAM_SEATS_COLLECTION)
      .where("team_owner_user_id", "==", targetId)
      .get();
    for (const d of snap.docs) {
      const st = d.data().status as string | undefined;
      if (st !== "active" && st !== "cold_storage") continue;
      const mid = d.data().member_user_id as string | undefined;
      if (mid) push(mid);
    }
    return out;
  }

  const wsSnap = await db.collection("workspaces").doc(targetId).get();
  if (!wsSnap.exists) return [];
  const ws = wsSnap.data() as Workspace;
  const orgId = ws.organization_id;
  if (!orgId) return [];

  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("status", "==", "active")
    .get();

  for (const d of seatsSnap.docs) {
    const userId = d.data().user_id as string | undefined;
    if (!userId) continue;
    if (await userCanAccessWorkspace(userId, targetId)) push(userId);
  }
  return out;
}

export async function createWorkspaceShareNotifications(params: {
  sharedByUserId: string;
  actorDisplayName: string;
  fileIds: string[];
  folderShareId: string;
  folderName?: string;
  workspaceShareName: string;
  workspaceTargetKey: string;
  kind: WorkspaceShareTargetKind;
  targetId: string;
  shareInboxScopeLabel?: string;
  shareSourceLabel?: string | null;
  targetOrganizationId?: string | null;
}): Promise<void> {
  const db = getAdminFirestore();
  const inboxUids = await getUserIdsForWorkspaceShareInbox(
    db,
    params.kind,
    params.targetId,
    params.sharedByUserId
  );
  const recipientSet = new Set(inboxUids);
  recipientSet.add(params.sharedByUserId);
  const recipientUids = Array.from(recipientSet);

  const routingBucket =
    params.kind === "personal_team"
      ? `team:${params.targetId}`
      : params.targetOrganizationId?.trim()
        ? `enterprise:${params.targetOrganizationId.trim()}`
        : "consumer";

  const fileCount = params.fileIds.length;
  const fileName =
    fileCount === 1 && params.fileIds[0] ? await getFileDisplayName(params.fileIds[0]) : undefined;
  const metadata = Object.fromEntries(
    Object.entries({
      fileName,
      folderName: params.folderName,
      actorDisplayName: params.actorDisplayName,
      fileCount: fileCount > 1 ? fileCount : undefined,
      workspaceShareName: params.workspaceShareName,
      workspaceTargetKey: params.workspaceTargetKey,
      shareToken: params.folderShareId,
      shareInboxScopeLabel: params.shareInboxScopeLabel,
      shareSourceLabel: params.shareSourceLabel ?? undefined,
      targetOrganizationId: params.targetOrganizationId?.trim() || undefined,
    }).filter(([, v]) => v !== undefined)
  ) as NonNullable<Notification["metadata"]>;

  const message = formatNotificationMessage("file_shared", params.actorDisplayName, metadata);

  const now = new Date();
  const batch = db.batch();
  for (const recipientUserId of recipientUids) {
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      recipientUserId,
      actorUserId: params.sharedByUserId,
      type: "file_shared",
      fileId: params.fileIds[0] ?? null,
      commentId: null,
      shareId: params.folderShareId,
      message,
      isRead: false,
      createdAt: now,
      routingBucket,
      metadata,
    });
  }
  await batch.commit();
}

/**
 * Create in-app notifications when a photographer creates an invite-only gallery.
 * For each invited email that matches a Firebase user, creates a notification.
 * Invitees without accounts receive the email only (no in-app notification).
 */
export async function createGalleryInviteNotifications(params: {
  photographerUserId: string;
  photographerDisplayName: string;
  galleryId: string;
  galleryTitle: string;
  invitedEmails: string[];
}): Promise<void> {
  const {
    photographerUserId,
    photographerDisplayName,
    galleryId,
    galleryTitle,
    invitedEmails,
  } = params;

  const emailLower = invitedEmails.map((e) => e?.toLowerCase?.() ?? "").filter(Boolean);
  if (emailLower.length === 0) return;

  const recipientUids: string[] = [];
  const auth = getAdminAuth();
  for (const inviteEmail of emailLower) {
    try {
      const userRecord = await auth.getUserByEmail(inviteEmail);
      if (userRecord?.uid && userRecord.uid !== photographerUserId) {
        recipientUids.push(userRecord.uid);
      }
    } catch {
      // User not found by email – no in-app notification, email only
    }
  }
  if (recipientUids.length === 0) return;

  for (const uid of recipientUids) {
    await createNotification({
      recipientUserId: uid,
      actorUserId: photographerUserId,
      type: "gallery_invite",
      fileId: null,
      commentId: null,
      shareId: null,
      metadata: {
        actorDisplayName: photographerDisplayName,
        galleryId,
        galleryTitle,
      },
    });
  }
}

/**
 * Create in-app notification when a transfer is sent to a client who has a BizziCloud account.
 * If the client email does not match a Firebase user, no notification is created (email is sent instead).
 */
export async function createTransferNotification(params: {
  clientEmail: string;
  sharedByUserId: string;
  actorDisplayName: string;
  transferSlug: string;
  transferName: string;
  fileCount: number;
}): Promise<void> {
  const { clientEmail, sharedByUserId, actorDisplayName, transferSlug, transferName, fileCount } =
    params;

  const emailTrimmed = clientEmail?.trim?.();
  if (!emailTrimmed) return;

  let recipientUid: string | null = null;
  try {
    const userRecord = await getAdminAuth().getUserByEmail(emailTrimmed.toLowerCase());
    if (userRecord?.uid && userRecord.uid !== sharedByUserId) {
      recipientUid = userRecord.uid;
    }
  } catch {
    // User not found – no in-app notification, email only
    return;
  }

  if (!recipientUid) return;

  await createNotification({
    recipientUserId: recipientUid,
    actorUserId: sharedByUserId,
    type: "transfer_sent",
    fileId: null,
    commentId: null,
    shareId: null,
    metadata: {
      actorDisplayName,
      transferSlug,
      transferName,
      fileCount: fileCount > 1 ? fileCount : undefined,
    },
  });
}

/**
 * Create in-app notification when an organization admin invites a user by email.
 * If the invitee has a Firebase account, they receive an in-app notification in addition to the email.
 */
export async function createOrgSeatInviteNotification(params: {
  inviteeEmail: string;
  invitedByUserId: string;
  actorDisplayName: string;
  orgId: string;
  orgName: string;
  inviteToken: string;
}): Promise<void> {
  const { inviteeEmail, invitedByUserId, actorDisplayName, orgId, orgName, inviteToken } =
    params;

  const emailTrimmed = inviteeEmail?.trim?.();
  if (!emailTrimmed) return;

  let recipientUid: string | null = null;
  try {
    const userRecord = await getAdminAuth().getUserByEmail(emailTrimmed.toLowerCase());
    if (userRecord?.uid && userRecord.uid !== invitedByUserId) {
      recipientUid = userRecord.uid;
    }
  } catch {
    // User not found by email – no in-app notification, email only
    return;
  }

  if (!recipientUid) return;

  await createNotification({
    recipientUserId: recipientUid,
    actorUserId: invitedByUserId,
    type: "org_seat_invite",
    fileId: null,
    commentId: null,
    shareId: null,
    metadata: {
      actorDisplayName,
      orgId,
      orgName,
      inviteToken,
    },
  });
}
