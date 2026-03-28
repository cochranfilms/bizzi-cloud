/**
 * POST /api/recent-opens - Record that the user opened a file or folder.
 * Body: { itemType: "file" | "folder", itemId: string }
 *
 * GET /api/recent-opens - List recently opened items (last 7 days).
 * Query: ?limit=50&context=personal|enterprise|team&organization_id=&team_owner_id=
 * Results are scoped to the active workspace (personal dashboard, enterprise org, or personal team).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import {
  hydrateCollaborationFileForApiResponse,
  resolveCollaborationFileContext,
} from "@/lib/file-access";
import { MACOS_PACKAGE_CONTAINERS_COLLECTION } from "@/lib/macos-package-container-admin";
import { parseMacosPackageIdFromSyntheticFileId } from "@/lib/macos-package-synthetic-id";
import {
  fileBelongsToPersonalTeamContainer,
  fileVisibleOnPersonalDashboard,
  isPersonalDashboardDriveDoc,
  isTeamContainerDriveDoc,
} from "@/lib/backup-scope";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team-constants";
import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";

const ACTIVE_TEAM_SEAT = new Set(["active", "cold_storage"]);

const RECENT_DAYS = 7;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const COLLECTION = "user_recent_opens";
const FETCH_MULTIPLIER = 6;
const MAX_FIRESTORE_CANDIDATES = 300;

type RecentListScope =
  | { kind: "personal" }
  | { kind: "enterprise"; organizationId: string }
  | { kind: "team"; teamOwnerUserId: string };

function folderDocMatchesScope(
  driveData: Record<string, unknown>,
  viewerUid: string,
  scope: RecentListScope
): boolean {
  if (driveData.deleted_at) return false;
  switch (scope.kind) {
    case "personal":
      return isPersonalDashboardDriveDoc(driveData, viewerUid);
    case "team":
      return isTeamContainerDriveDoc(driveData, scope.teamOwnerUserId);
    case "enterprise": {
      const oid = (driveData.organization_id as string | undefined) ?? null;
      return oid === scope.organizationId;
    }
  }
}

async function verifyRecentOpenFileMatchesScope(
  db: Firestore,
  viewerUid: string,
  viewerEmail: string | undefined,
  collabFileId: string,
  scope: RecentListScope
): Promise<boolean> {
  const ctx = await resolveCollaborationFileContext(viewerUid, collabFileId, viewerEmail);
  if (!ctx.ok) return false;

  const pkgId = parseMacosPackageIdFromSyntheticFileId(collabFileId);
  let driveId: string;
  let fileData: Record<string, unknown>;

  if (pkgId) {
    const cref = await db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(pkgId).get();
    if (!cref.exists) return false;
    const cd = cref.data() as Record<string, unknown>;
    driveId = (cd.linked_drive_id as string) ?? "";
    const anchorSnap = await db.collection("backup_files").doc(ctx.anchorBackupFileId).get();
    if (!anchorSnap.exists) return false;
    fileData = anchorSnap.data() as Record<string, unknown>;
  } else {
    const fileSnap = await db.collection("backup_files").doc(ctx.anchorBackupFileId).get();
    if (!fileSnap.exists) return false;
    fileData = fileSnap.data() as Record<string, unknown>;
    driveId = (fileData.linked_drive_id as string) ?? "";
  }

  if (!isBackupFileActiveForListing(fileData)) return false;

  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  if (!driveSnap.exists) return false;
  const driveData = driveSnap.data() as Record<string, unknown>;

  switch (scope.kind) {
    case "personal":
      return (
        fileVisibleOnPersonalDashboard(fileData, viewerUid) &&
        isPersonalDashboardDriveDoc(driveData, viewerUid)
      );
    case "team":
      if (fileData.organization_id != null && fileData.organization_id !== "") return false;
      return (
        isTeamContainerDriveDoc(driveData, scope.teamOwnerUserId) &&
        fileBelongsToPersonalTeamContainer(fileData, scope.teamOwnerUserId)
      );
    case "enterprise": {
      const dro = (driveData.organization_id as string | undefined) ?? null;
      if (dro !== scope.organizationId) return false;
      const fo = (fileData.organization_id as string | undefined) ?? null;
      return fo == null || fo === "" || fo === scope.organizationId;
    }
  }
}

async function resolveRecentListScope(
  request: Request,
  uid: string,
  db: Firestore
): Promise<RecentListScope | NextResponse> {
  const url = new URL(request.url);
  const context = (url.searchParams.get("context") ?? "personal").trim().toLowerCase();

  if (context === "personal") {
    return { kind: "personal" };
  }

  if (context === "enterprise") {
    const organizationId = url.searchParams.get("organization_id")?.trim() || null;
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id required when context=enterprise" },
        { status: 400 }
      );
    }
    const access = await resolveEnterpriseAccess(uid, organizationId, db);
    if (!access.canAccessEnterprise) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return { kind: "enterprise", organizationId };
  }

  if (context === "team") {
    const teamOwnerUserId = url.searchParams.get("team_owner_id")?.trim() || null;
    if (!teamOwnerUserId) {
      return NextResponse.json(
        { error: "team_owner_id required when context=team" },
        { status: 400 }
      );
    }
    if (uid !== teamOwnerUserId) {
      const seatSnap = await db
        .collection(PERSONAL_TEAM_SEATS_COLLECTION)
        .doc(`${teamOwnerUserId}_${uid}`)
        .get();
      const st = seatSnap.data()?.status as string | undefined;
      if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return { kind: "team", teamOwnerUserId };
  }

  return NextResponse.json({ error: "Invalid context" }, { status: 400 });
}

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

  const db = getAdminFirestore();
  const scope = await resolveRecentListScope(request, auth.uid, db);
  if (scope instanceof NextResponse) return scope;

  const since = new Date();
  since.setDate(since.getDate() - RECENT_DAYS);

  const fetchCap = Math.min(Math.max(limit * FETCH_MULTIPLIER, limit + 20), MAX_FIRESTORE_CANDIDATES);
  const snap = await db
    .collection(COLLECTION)
    .where("userId", "==", auth.uid)
    .where("openedAt", ">=", since)
    .orderBy("openedAt", "desc")
    .limit(fetchCap)
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
  const candidates = Array.from(byKey.values()).sort(
    (a, b) => b.openedAt.getTime() - a.openedAt.getTime()
  );

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

  for (const item of candidates) {
    if (result.length >= limit) break;
    if (item.itemType === "file") {
      const ok = await verifyRecentOpenFileMatchesScope(
        db,
        auth.uid,
        auth.email,
        item.itemId,
        scope
      );
      if (!ok) continue;

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
      const data = driveSnap.data() as Record<string, unknown>;
      if (!folderDocMatchesScope(data, auth.uid, scope)) continue;
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
