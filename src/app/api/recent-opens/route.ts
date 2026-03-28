/**
 * POST /api/recent-opens - Record that the user opened a file or folder.
 * Body: { itemType: "file" | "folder", itemId: string }
 *
 * GET /api/recent-opens - List recently opened items (last 7 days).
 * Query: ?limit=50
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { hydrateCollaborationFileForApiResponse, resolveCollaborationFileContext } from "@/lib/file-access";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team-constants";
import { NextResponse } from "next/server";

const ACTIVE_TEAM_SEAT = new Set(["active", "cold_storage"]);

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
    const ctx = await resolveCollaborationFileContext(auth.uid, itemId, auth.email);
    if (!ctx.ok) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  } else {
    const driveSnap = await db.collection("linked_drives").doc(itemId).get();
    if (!driveSnap.exists) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    const data = driveSnap.data();
    const ownerId = data?.userId as string;
    const orgId = data?.organization_id as string | undefined;
    const pto = data?.personal_team_owner_id as string | undefined;
    const isOwner = ownerId === auth.uid;
    const orgAccess = orgId
      ? await resolveEnterpriseAccess(auth.uid, orgId, db)
      : null;
    const isOrgAdmin = Boolean(orgAccess?.isAdmin);
    const isTeamContainer =
      !orgId && typeof pto === "string" && pto.length > 0 && ownerId === pto;
    let isTeamSeatMember = false;
    if (isTeamContainer && !isOwner && ownerId) {
      const seatSnap = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(`${pto}_${auth.uid}`).get();
      const st = (seatSnap.data()?.status as string) ?? "";
      isTeamSeatMember = seatSnap.exists && ACTIVE_TEAM_SEAT.has(st);
    }
    if (!isOwner && !isOrgAdmin && !isTeamSeatMember) {
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
      const row = await hydrateCollaborationFileForApiResponse(
        auth.uid,
        auth.email,
        item.itemId,
        driveMap
      );
      if (!row) continue;

      result.push({
        type: "file",
        id: row.id,
        name: row.name,
        driveId: row.driveId,
        driveName: row.driveName,
        path: row.path,
        objectKey: row.objectKey,
        size: row.size,
        modifiedAt: row.modifiedAt,
        contentType: row.contentType,
        galleryId: row.galleryId,
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
