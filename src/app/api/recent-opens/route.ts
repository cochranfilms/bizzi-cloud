/**
 * POST /api/recent-opens - Record that the user opened a file or folder.
 * Body: { itemType: "file" | "folder", itemId: string }
 *
 * GET /api/recent-opens - List recently opened items (last 7 days).
 * Query: ?limit=50
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { canAccessBackupFileById } from "@/lib/file-access";
import { NextResponse } from "next/server";

const RECENT_DAYS = 7;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const COLLECTION = "user_recent_opens";

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

function getDocId(uid: string, itemType: string, itemId: string): string {
  return `${uid}_${itemType}_${itemId}`;
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { itemType?: string; itemId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemType = body.itemType === "file" || body.itemType === "folder" ? body.itemType : null;
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : null;
  if (!itemType || !itemId) {
    return NextResponse.json({ error: "itemType (file|folder) and itemId required" }, { status: 400 });
  }

  const db = getAdminFirestore();

  if (itemType === "file") {
    const hasAccess = await canAccessBackupFileById(auth.uid, itemId, auth.email);
    if (!hasAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  } else {
    const driveSnap = await db.collection("linked_drives").doc(itemId).get();
    if (!driveSnap.exists) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    const data = driveSnap.data();
    const ownerId = data?.userId as string;
    const orgId = data?.organization_id as string | undefined;
    const isOwner = ownerId === auth.uid;
    const isOrgAdmin =
      orgId &&
      (await db
        .collection("organization_seats")
        .doc(`${orgId}_${auth.uid}`)
        .get()).exists &&
      (await db.collection("organization_seats").doc(`${orgId}_${auth.uid}`).get()).data()?.role === "admin";
    if (!isOwner && !isOrgAdmin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const docId = getDocId(auth.uid, itemType, itemId);
  const now = new Date();
  await db.collection(COLLECTION).doc(docId).set(
    {
      userId: auth.uid,
      itemType,
      itemId,
      openedAt: now,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const since = new Date();
  since.setDate(since.getDate() - RECENT_DAYS);

  const db = getAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("userId", "==", auth.uid)
    .where("openedAt", ">=", since)
    .orderBy("openedAt", "desc")
    .limit(limit * 2)
    .get();

  const byKey = new Map<string, { itemType: string; itemId: string; openedAt: Date }>();
  for (const d of snap.docs) {
    const data = d.data();
    const key = `${data.itemType}_${data.itemId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        itemType: data.itemType,
        itemId: data.itemId,
        openedAt: data.openedAt?.toDate?.() ?? new Date(data.openedAt),
      });
    }
  }
  const items = Array.from(byKey.values()).slice(0, limit);

  const driveMap = new Map<string, string>();
  const result: Array<{
    type: "file" | "folder";
    id: string;
    name: string;
    driveId?: string;
    driveName?: string;
    path?: string;
    objectKey?: string;
    size?: number;
    modifiedAt?: string | null;
    contentType?: string | null;
    galleryId?: string | null;
    openedAt: string;
  }> = [];

  for (const item of items) {
    if (item.itemType === "file") {
      const hasAccess = await canAccessBackupFileById(auth.uid, item.itemId, auth.email);
      if (!hasAccess) continue;

      const fileSnap = await db.collection("backup_files").doc(item.itemId).get();
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

      const modifiedAt =
        data?.modified_at != null
          ? typeof data.modified_at === "string"
            ? data.modified_at
            : (data.modified_at as { toDate?: () => Date }).toDate?.()?.toISOString?.() ?? null
          : null;

      result.push({
        type: "file",
        id: fileSnap.id,
        name,
        driveId,
        driveName: driveName ?? "Unknown",
        path,
        objectKey: (data?.object_key as string) ?? "",
        size: (data?.size_bytes as number) ?? 0,
        modifiedAt,
        contentType: (data?.content_type as string) ?? null,
        galleryId: (data?.gallery_id as string) ?? null,
        openedAt: item.openedAt.toISOString(),
      });
    } else {
      const driveSnap = await db.collection("linked_drives").doc(item.itemId).get();
      if (!driveSnap.exists) continue;
      const data = driveSnap.data();
      const name = (data?.name as string) ?? "Folder";

      result.push({
        type: "folder",
        id: driveSnap.id,
        name,
        driveId: driveSnap.id,
        driveName: name,
        openedAt: item.openedAt.toISOString(),
      });
    }
  }

  return NextResponse.json({ items: result });
}
