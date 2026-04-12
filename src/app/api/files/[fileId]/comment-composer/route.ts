/**
 * GET /api/files/[fileId]/comment-composer — visibility choices for the comment composer.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveCollaborationFileContext } from "@/lib/file-access";
import { allowedCommentVisibilityOptions } from "@/lib/file-comment-scope";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { fileId: rawFileId } = await params;
  const fileId = rawFileId ? decodeURIComponent(rawFileId) : "";
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const ctx = await resolveCollaborationFileContext(uid, fileId);
  if (!ctx.ok) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const anchorId = ctx.anchorBackupFileId;

  const db = getAdminFirestore();
  const fileSnap = await db.collection("backup_files").doc(anchorId).get();
  if (!fileSnap.exists) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const visibilityOptions = allowedCommentVisibilityOptions(fileSnap.data(), uid);
  return NextResponse.json({ visibilityOptions });
}
