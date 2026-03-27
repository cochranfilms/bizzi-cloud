/**
 * PATCH /api/files/[fileId]/comments/[commentId] - Edit own comment.
 * DELETE /api/files/[fileId]/comments/[commentId] - Soft-delete own comment.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { canAccessBackupFileById } from "@/lib/file-access";
import { canModerateFileComment } from "@/lib/file-comment-moderation";
import { createNotification } from "@/lib/notification-service";
import { getFileDisplayName } from "@/lib/file-access";
import { NextResponse } from "next/server";

async function requireAuth(request: Request): Promise<{ uid: string; email?: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fileId: string; commentId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { fileId, commentId } = await params;
  if (!fileId || !commentId) return NextResponse.json({ error: "IDs required" }, { status: 400 });

  const hasAccess = await canAccessBackupFileById(auth.uid, fileId, auth.email);
  if (!hasAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const trimmed = typeof body.body === "string" ? body.body.trim() : "";
  if (!trimmed || trimmed.length > 2000) {
    return NextResponse.json({ error: "body required (max 2000 chars)" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection("file_comments").doc(commentId);
  const docSnap = await ref.get();
  if (!docSnap.exists) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (docSnap.data()?.fileId !== fileId) return NextResponse.json({ error: "Mismatch" }, { status: 400 });
  if (docSnap.data()?.authorUserId !== auth.uid) {
    return NextResponse.json({ error: "Can only edit your own comment" }, { status: 403 });
  }

  const now = new Date();
  await ref.update({
    body: trimmed.slice(0, 2000),
    isEdited: true,
    updatedAt: now,
  });

  const fileSnap = await db.collection("backup_files").doc(fileId).get();
  const ownerId = fileSnap.data()?.userId as string;
  const profileSnap = await db.collection("profiles").doc(auth.uid).get();
  const actorDisplayName =
    (profileSnap.data()?.displayName as string) ?? auth.email?.split("@")[0] ?? "Someone";

  if (ownerId !== auth.uid) {
    await createNotification({
      recipientUserId: ownerId,
      actorUserId: auth.uid,
      type: "file_comment_edited",
      fileId,
      commentId,
      metadata: { actorDisplayName },
    });
  }

  return NextResponse.json({
    id: commentId,
    body: trimmed,
    isEdited: true,
    updatedAt: now.toISOString(),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ fileId: string; commentId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { fileId, commentId } = await params;
  if (!fileId || !commentId) return NextResponse.json({ error: "IDs required" }, { status: 400 });

  const hasAccess = await canAccessBackupFileById(auth.uid, fileId, auth.email);
  if (!hasAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getAdminFirestore();
  const ref = db.collection("file_comments").doc(commentId);
  const docSnap = await ref.get();
  if (!docSnap.exists) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (docSnap.data()?.fileId !== fileId) return NextResponse.json({ error: "Mismatch" }, { status: 400 });
  const authorId = docSnap.data()?.authorUserId as string;
  const canModerate = await canModerateFileComment(auth.uid, fileId);
  if (authorId !== auth.uid && !canModerate) {
    return NextResponse.json({ error: "Can only delete your own comment" }, { status: 403 });
  }

  const now = new Date();
  await ref.update({
    isDeleted: true,
    body: "[deleted]",
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}
