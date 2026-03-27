/**
 * GET /api/files/[fileId]/comments - List comments for a file.
 * POST /api/files/[fileId]/comments - Create a comment.
 */
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  canAccessBackupFileById,
  getFileDisplayName,
} from "@/lib/file-access";
import { createNotification } from "@/lib/notification-service";
import {
  deriveFileCommentScope,
  snapshotAuthorRoleForFile,
} from "@/lib/file-comment-scope";
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

function mapCommentDoc(d: QueryDocumentSnapshot) {
  const data = d.data();
  return {
    id: d.id,
    fileId: data.fileId as string,
    parentCommentId: (data.parentCommentId ?? null) as string | null,
    authorUserId: data.authorUserId as string,
    authorDisplayName: (data.author_display_name ?? null) as string | null,
    authorEmail: (data.author_email ?? null) as string | null,
    authorPhotoURL: (data.author_photo_url ?? null) as string | null,
    authorRoleSnapshot: (data.author_role_snapshot ?? null) as string | null,
    workspace_type: (data.workspace_type ?? null) as string | null,
    workspace_id: (data.workspace_id ?? null) as string | null,
    visibility_scope: (data.visibility_scope ?? null) as string | null,
    body: data.body ?? "",
    isEdited: !!data.isEdited,
    isDeleted: !!data.isDeleted,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  };
}

type CommentRow = ReturnType<typeof mapCommentDoc>;

async function hydrateAuthorFields(rows: CommentRow[]): Promise<CommentRow[]> {
  const need = [
    ...new Set(
      rows.filter((r) => !r.authorDisplayName && r.authorUserId).map((r) => r.authorUserId)
    ),
  ];
  if (need.length === 0) return rows;
  const db = getAdminFirestore();
  const snaps = await Promise.all(need.map((uid) => db.collection("profiles").doc(uid).get()));
  const map = new Map<string, { displayName?: string; email?: string }>();
  need.forEach((uid, i) => {
    const p = snaps[i].data();
    map.set(uid, {
      displayName: (p?.displayName as string | undefined) ?? undefined,
      email: (p?.email as string | undefined) ?? undefined,
    });
  });
  return rows.map((r) => {
    if (r.authorDisplayName) return r;
    const p = map.get(r.authorUserId);
    return {
      ...r,
      authorDisplayName: p?.displayName?.trim() || `User ${r.authorUserId.slice(0, 6)}`,
      authorEmail: r.authorEmail ?? p?.email ?? null,
    };
  });
}

async function hydrateAuthorPhotos(rows: CommentRow[]): Promise<CommentRow[]> {
  const need = [
    ...new Set(
      rows.filter((r) => !r.authorPhotoURL && r.authorUserId).map((r) => r.authorUserId)
    ),
  ];
  if (need.length === 0) return rows;
  const auth = getAdminAuth();
  const photoByUid = new Map<string, string | null>();
  const chunk = 100;
  for (let i = 0; i < need.length; i += chunk) {
    const batch = need.slice(i, i + chunk);
    try {
      const result = await auth.getUsers(batch.map((uid) => ({ uid })));
      result.users.forEach((u) => photoByUid.set(u.uid, u.photoURL ?? null));
    } catch (e) {
      console.error("[comments GET] hydrateAuthorPhotos batch error", e);
    }
  }
  return rows.map((r) => {
    if (r.authorPhotoURL) return r;
    const url = photoByUid.get(r.authorUserId);
    return url ? { ...r, authorPhotoURL: url } : r;
  });
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
  const order = url.searchParams.get("order") === "desc" ? "desc" : "asc";

  let snap;
  try {
    snap = await db
      .collection("file_comments")
      .where("fileId", "==", fileId)
      .orderBy("createdAt", order === "desc" ? "desc" : "asc")
      .limit(limit)
      .get();
  } catch (err) {
    console.error("[comments GET] query error", err);
    return NextResponse.json(
      { error: "Failed to load comments. If this persists, deploy Firestore indexes." },
      { status: 500 }
    );
  }

  let comments = snap.docs.map((d) => mapCommentDoc(d));
  comments = await hydrateAuthorFields(comments);
  comments = await hydrateAuthorPhotos(comments);

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
  const fileData = fileSnap.data()!;
  const ownerId = fileData.userId as string;

  const scope = deriveFileCommentScope(fileData, auth.uid);
  if (!scope) return NextResponse.json({ error: "Invalid file" }, { status: 400 });

  const authorRoleSnapshot = await snapshotAuthorRoleForFile(auth.uid, fileData);
  const profileSnap = await db.collection("profiles").doc(auth.uid).get();
  const prof = profileSnap.data();
  const authorDisplayName =
    (prof?.displayName as string | undefined)?.trim() ||
    auth.email?.split("@")[0] ||
    "Member";
  const authorEmail = (prof?.email as string | undefined) || auth.email || null;

  let authorPhotoURL: string | null = null;
  try {
    const authUser = await getAdminAuth().getUser(auth.uid);
    authorPhotoURL = authUser.photoURL ?? null;
  } catch {
    // ignore
  }

  const now = new Date();
  const doc: Record<string, unknown> = {
    fileId,
    parentCommentId: parentCommentId && typeof parentCommentId === "string" ? parentCommentId : null,
    authorUserId: auth.uid,
    author_display_name: authorDisplayName,
    author_email: authorEmail,
    author_photo_url: authorPhotoURL,
    author_role_snapshot: authorRoleSnapshot,
    workspace_type: scope.workspace_type,
    workspace_id: scope.workspace_id,
    organization_id: scope.organization_id,
    personal_team_owner_id: scope.personal_team_owner_id,
    file_owner_id: scope.file_owner_id,
    visibility_scope: scope.visibility_scope,
    body: trimmed.slice(0, 2000),
    isEdited: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection("file_comments").add(doc);

  if (doc.parentCommentId) {
    const parentSnap = await db.collection("file_comments").doc(doc.parentCommentId as string).get();
    const parentAuthor = parentSnap.data()?.authorUserId as string | undefined;
    if (parentAuthor && parentAuthor !== auth.uid) {
      const fileName = await getFileDisplayName(fileId);
      await createNotification({
        recipientUserId: parentAuthor,
        actorUserId: auth.uid,
        type: "file_reply_created",
        fileId,
        commentId: ref.id,
        metadata: { fileName, actorDisplayName: authorDisplayName, parentCommentId: doc.parentCommentId as string },
      });
    }
  } else if (ownerId !== auth.uid) {
    const fileName = await getFileDisplayName(fileId);
    await createNotification({
      recipientUserId: ownerId,
      actorUserId: auth.uid,
      type: "file_comment_created",
      fileId,
      commentId: ref.id,
      metadata: { fileName, actorDisplayName: authorDisplayName },
    });
  }

  return NextResponse.json({
    id: ref.id,
    fileId,
    parentCommentId: doc.parentCommentId,
    authorUserId: auth.uid,
    authorDisplayName,
    authorEmail,
    authorPhotoURL,
    authorRoleSnapshot,
    workspace_type: scope.workspace_type,
    workspace_id: scope.workspace_id,
    visibility_scope: scope.visibility_scope,
    body: doc.body,
    isEdited: false,
    isDeleted: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}
