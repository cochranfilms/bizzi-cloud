/**
 * GET /api/files/[fileId]/hearts - Get heart summary (count + hasHearted for current user).
 * POST /api/files/[fileId]/hearts - Toggle heart (add if not present, remove if present).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  getCollaborationFileDisplayName,
  resolveCollaborationFileContext,
} from "@/lib/file-access";
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
  const { fileId: rawFileId } = await params;
  const fileId = rawFileId ? decodeURIComponent(rawFileId) : "";
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const ctx = await resolveCollaborationFileContext(auth.uid, fileId, auth.email);
  if (!ctx.ok) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const collabFileId = ctx.collabFileId;

  const db = getAdminFirestore();
  const [countSnap, userHeartSnap] = await Promise.all([
    db.collection("file_hearts").where("fileId", "==", collabFileId).count().get(),
    db.collection("file_hearts").where("fileId", "==", collabFileId).where("userId", "==", auth.uid).limit(1).get(),
  ]);

  return NextResponse.json({
    count: countSnap.data().count,
    hasHearted: !userHeartSnap.empty,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { fileId: rawFileId } = await params;
  const fileId = rawFileId ? decodeURIComponent(rawFileId) : "";
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const ctx = await resolveCollaborationFileContext(auth.uid, fileId, auth.email);
  if (!ctx.ok) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const collabFileId = ctx.collabFileId;
  const anchorId = ctx.anchorBackupFileId;

  const db = getAdminFirestore();
  const fileSnap = await db.collection("backup_files").doc(anchorId).get();
  if (!fileSnap.exists) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const ownerId = fileSnap.data()?.userId as string;

  const existingSnap = await db
    .collection("file_hearts")
    .where("fileId", "==", collabFileId)
    .where("userId", "==", auth.uid)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    await existingSnap.docs[0].ref.delete();
    const countSnap = await db.collection("file_hearts").where("fileId", "==", collabFileId).count().get();
    return NextResponse.json({
      hasHearted: false,
      count: countSnap.data().count,
    });
  }

  await db.collection("file_hearts").add({
    fileId: collabFileId,
    userId: auth.uid,
    createdAt: new Date(),
  });

  const countSnap = await db.collection("file_hearts").where("fileId", "==", collabFileId).count().get();
  const profileSnap = await db.collection("profiles").doc(auth.uid).get();
  const actorDisplayName =
    (profileSnap.data()?.displayName as string) ?? auth.email?.split("@")[0] ?? "Someone";

  if (ownerId !== auth.uid) {
    const fileName = await getCollaborationFileDisplayName(collabFileId, anchorId);
    await createNotification({
      recipientUserId: ownerId,
      actorUserId: auth.uid,
      type: "file_hearted",
      fileId: collabFileId,
      metadata: { fileName, actorDisplayName },
    });
  }

  return NextResponse.json({
    hasHearted: true,
    count: countSnap.data().count,
  });
}
