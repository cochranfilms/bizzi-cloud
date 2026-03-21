/**
 * GET /api/files/hearted - List files the current user has hearted (paginated).
 * Query: ?limit=50&cursor=heartDocId
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { canAccessBackupFileById } from "@/lib/file-access";
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
    const hasAccess = await canAccessBackupFileById(uid, fileId, email);
    if (!hasAccess) continue;

    const fileSnap = await db.collection("backup_files").doc(fileId).get();
    if (!fileSnap.exists) continue;

    const data = fileSnap.data();
    if (data?.deleted_at) continue;

    const path = (data?.relative_path as string) ?? "";
    const name = path.split("/").filter(Boolean).pop() ?? (path || "?");
    const driveId = (data?.linked_drive_id as string) ?? "";
    let driveName = driveMap.get(driveId);
    if (!driveName && driveId) {
      const driveSnap = await db.collection("linked_drives").doc(driveId).get();
      driveName = driveSnap.exists ? (driveSnap.data()?.name as string) ?? "Folder" : "Unknown";
      driveMap.set(driveId, driveName);
    }

    files.push({
      id: fileSnap.id,
      name,
      path,
      objectKey: (data?.object_key as string) ?? "",
      size: (data?.size_bytes as number) ?? 0,
      modifiedAt:
        data?.modified_at != null
          ? typeof data.modified_at === "string"
            ? data.modified_at
            : (data.modified_at as { toDate?: () => Date }).toDate?.()?.toISOString?.() ?? null
          : null,
      driveId,
      driveName: driveName ?? "Unknown",
      contentType: (data?.content_type as string) ?? null,
      galleryId: (data?.gallery_id as string) ?? null,
    });
  }

  const lastDoc = docs[docs.length - 1];
  return NextResponse.json({
    files,
    nextCursor: hasMore && lastDoc ? lastDoc.id : null,
    hasMore,
  });
}
