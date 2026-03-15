/**
 * GET /api/files/[fileId]/comments - List comments for a file.
 * POST /api/files/[fileId]/comments - Create a comment.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { canAccessBackupFileById, getFileDisplayName } from "@/lib/file-access";
import { createNotification } from "@/lib/notification-service";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { fileId } = await params;
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const hasAccess = await canAccessBackupFileById(auth.uid, fileId, auth.email);
  if (!hasAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getAdminFirestore();
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);

  const snap = await db
    .collection("file_comments")
    .where("fileId", "==", fileId)
    .orderBy("createdAt", "asc")
    .limit(limit)
    .get();

  const comments = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      fileId: data.fileId,
      parentCommentId: data.parentCommentId ?? null,
      authorUserId: data.authorUserId,
      body: data.body ?? "",
      isEdited: !!data.isEdited,
      isDeleted: !!data.isDeleted,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  return NextResponse.json({ comments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { fileId } = await params;
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const hasAccess = await canAccessBackupFileById(auth.uid, fileId, auth.email);
  if (!hasAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { body: commentBody, parentCommentId } = body;
  const trimmed = typeof commentBody === "string" ? commentBody.trim() : "";
  if (!trimmed || trimmed.length > 2000) {
    return NextResponse.json({ error: "body required (max 2000 chars)" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const fileSnap = await db.collection("backup_files").doc(fileId).get();
  if (!fileSnap.exists) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const ownerId = fileSnap.data()?.userId as string;

  const now = new Date();
  const doc: Record<string, unknown> = {
    fileId,
    parentCommentId: parentCommentId && typeof parentCommentId === "string" ? parentCommentId : null,
    authorUserId: auth.uid,
    body: trimmed.slice(0, 2000),
    isEdited: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection("file_comments").add(doc);

  const type = doc.parentCommentId ? "file_reply_created" : "file_comment_created";
  const fileName = await getFileDisplayName(fileId);
  const profileSnap = await db.collection("profiles").doc(auth.uid).get();
  const actorDisplayName =
    (profileSnap.data()?.displayName as string) ?? auth.email?.split("@")[0] ?? "Someone";

  if (doc.parentCommentId) {
    const parentSnap = await db.collection("file_comments").doc(doc.parentCommentId as string).get();
    const parentAuthor = parentSnap.data()?.authorUserId as string | undefined;
    if (parentAuthor && parentAuthor !== auth.uid) {
      await createNotification({
        recipientUserId: parentAuthor,
        actorUserId: auth.uid,
        type: "file_reply_created",
        fileId,
        commentId: ref.id,
        metadata: { fileName, actorDisplayName, parentCommentId: doc.parentCommentId as string },
      });
    }
  } else if (ownerId !== auth.uid) {
    await createNotification({
      recipientUserId: ownerId,
      actorUserId: auth.uid,
      type: "file_comment_created",
      fileId,
      commentId: ref.id,
      metadata: { fileName, actorDisplayName },
    });
  }

  return NextResponse.json({
    id: ref.id,
    fileId,
    parentCommentId: doc.parentCommentId,
    authorUserId: auth.uid,
    body: doc.body,
    isEdited: false,
    isDeleted: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}
