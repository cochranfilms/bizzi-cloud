/**
 * GET /api/files/hearted - List files the current user has hearted (paginated).
 * Query: ?limit=50&cursor=heartDocId
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { hydrateCollaborationFileForApiResponse } from "@/lib/file-access";
import { NextResponse } from "next/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      1),
    MAX_LIMIT
  );
  const cursor = url.searchParams.get("cursor") ?? null;

  const db = getAdminFirestore();
  let q = db
    .collection("file_hearts")
    .where("userId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(limit + 1);

  if (cursor) {
    const cursorDoc = await db.collection("file_hearts").doc(cursor).get();
    if (cursorDoc.exists && (cursorDoc.data()?.userId as string) === uid) {
      q = q.startAfter(cursorDoc);
    }
  }

  const heartsSnap = await q.get();
  const docs = heartsSnap.docs.slice(0, limit);
  const hasMore = heartsSnap.docs.length > limit;

  const fileIds = docs.map((d) => d.data().fileId as string).filter(Boolean);
  if (fileIds.length === 0) {
    return NextResponse.json({
      files: [],
      nextCursor: null,
      hasMore: false,
    });
  }

  const driveMap = new Map<string, string>();
  const files: Array<{
    id: string;
    name: string;
    path: string;
    objectKey: string;
    size: number;
    modifiedAt: string | null;
    driveId: string;
    driveName: string;
    contentType: string | null;
    galleryId: string | null;
  }> = [];

  for (const fileId of fileIds) {
    const row = await hydrateCollaborationFileForApiResponse(uid, email, fileId, driveMap);
    if (!row) continue;

    files.push({
      id: row.id,
      name: row.name,
      path: row.path,
      objectKey: row.objectKey,
      size: row.size,
      modifiedAt: row.modifiedAt,
      driveId: row.driveId,
      driveName: row.driveName,
      contentType: row.contentType,
      galleryId: row.galleryId,
    });
  }

  const lastDoc = docs[docs.length - 1];
  return NextResponse.json({
    files,
    nextCursor: hasMore && lastDoc ? lastDoc.id : null,
    hasMore,
  });
}
