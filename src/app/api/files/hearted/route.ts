/**
 * GET /api/files/hearted - List hearted files (paginated).
 * Query: ?limit=50&cursor=heartDocId
 * Workspace (team / enterprise): ?workspace_scope=team&team_owner_id=UID
 *   or ?workspace_scope=enterprise&organization_id=ORG — lists files hearted by any seat member
 *   the caller can access (same hydrate path as personal hearts). Pagination (cursor) is only supported
 *   for personal scope; workspace responses use hasMore: false.
 */
import type { DocumentData, Firestore, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { hydrateCollaborationFileForApiResponse } from "@/lib/file-access";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { NextResponse } from "next/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function personalTeamSeatAllowsAccess(status: string | undefined): boolean {
  return status === "active" || status === "cold_storage";
}

function heartDocCreatedMs(data: DocumentData): number {
  const ca = data.createdAt as Timestamp | Date | { toMillis?: () => number } | undefined;
  if (ca && typeof (ca as { toMillis?: () => number }).toMillis === "function") {
    return (ca as { toMillis: () => number }).toMillis();
  }
  if (ca instanceof Date) return ca.getTime();
  return 0;
}

async function resolveTeamWorkspaceHeartUserIds(
  db: Firestore,
  actorUid: string,
  teamOwnerId: string
): Promise<string[] | NextResponse> {
  if (actorUid !== teamOwnerId) {
    const seatSnap = await db
      .collection(PERSONAL_TEAM_SEATS_COLLECTION)
      .doc(personalTeamSeatDocId(teamOwnerId, actorUid))
      .get();
    const st = seatSnap.data()?.status as string | undefined;
    if (!seatSnap.exists || !personalTeamSeatAllowsAccess(st)) {
      return NextResponse.json({ error: "Not a member of this team workspace" }, { status: 403 });
    }
  }

  const uids = new Set<string>([teamOwnerId]);
  const seatsSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", teamOwnerId)
    .get();

  for (const d of seatsSnap.docs) {
    const data = d.data();
    const st = data?.status as string | undefined;
    if (!personalTeamSeatAllowsAccess(st)) continue;
    const mid = data?.member_user_id as string | undefined;
    if (mid) uids.add(mid);
  }
  return [...uids];
}

async function resolveEnterpriseWorkspaceHeartUserIds(
  db: Firestore,
  actorUid: string,
  organizationId: string
): Promise<string[] | NextResponse> {
  const access = await resolveEnterpriseAccess(actorUid, organizationId, db);
  if (!access.canAccessEnterprise) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }
  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", organizationId)
    .where("status", "==", "active")
    .get();
  const uids: string[] = [];
  for (const d of seatsSnap.docs) {
    const u = d.data()?.user_id as string | undefined;
    if (u) uids.push(u);
  }
  return uids;
}

type Hydrated = {
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
};

async function hydrateHeartFileIds(
  uid: string,
  email: string | undefined,
  fileIds: string[]
): Promise<Hydrated[]> {
  const driveMap = new Map<string, string>();
  const files: Hydrated[] = [];
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
  return files;
}

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
    Math.max(parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const cursor = url.searchParams.get("cursor") ?? null;
  const workspaceScope = (url.searchParams.get("workspace_scope") ?? "").trim().toLowerCase();
  const teamOwnerId = (url.searchParams.get("team_owner_id") ?? "").trim();
  const organizationId = (url.searchParams.get("organization_id") ?? "").trim();

  const db = getAdminFirestore();

  if (workspaceScope === "team") {
    if (!teamOwnerId) {
      return NextResponse.json({ error: "team_owner_id required" }, { status: 400 });
    }
    if (cursor) {
      return NextResponse.json({ error: "Pagination cursor is not supported for team workspace hearts" }, { status: 400 });
    }
    const memberUidsOrErr = await resolveTeamWorkspaceHeartUserIds(db, uid, teamOwnerId);
    if (memberUidsOrErr instanceof NextResponse) return memberUidsOrErr;
    const memberUids = memberUidsOrErr;
    const perUser = Math.min(40, limit + 20);
    type HeartRow = { docId: string; fileId: string; createdAtMs: number };
    const rowLists = await Promise.all(
      memberUids.map(async (memberUid) => {
        const snap = await db
          .collection("file_hearts")
          .where("userId", "==", memberUid)
          .orderBy("createdAt", "desc")
          .limit(perUser)
          .get();
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            docId: d.id,
            fileId: data.fileId as string,
            createdAtMs: heartDocCreatedMs(data),
          };
        });
      })
    );
    const byFile = new Map<string, HeartRow>();
    for (const rows of rowLists) {
      for (const r of rows) {
        if (!r.fileId) continue;
        const prev = byFile.get(r.fileId);
        if (!prev || r.createdAtMs > prev.createdAtMs) byFile.set(r.fileId, r);
      }
    }
    const merged = [...byFile.values()].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, limit);
    const fileIds = merged.map((m) => m.fileId);
    const files = await hydrateHeartFileIds(uid, email, fileIds);
    return NextResponse.json({
      files,
      nextCursor: null,
      hasMore: false,
    });
  }

  if (workspaceScope === "enterprise") {
    if (!organizationId) {
      return NextResponse.json({ error: "organization_id required" }, { status: 400 });
    }
    if (cursor) {
      return NextResponse.json(
        { error: "Pagination cursor is not supported for organization workspace hearts" },
        { status: 400 }
      );
    }
    const memberUidsOrErr = await resolveEnterpriseWorkspaceHeartUserIds(db, uid, organizationId);
    if (memberUidsOrErr instanceof NextResponse) return memberUidsOrErr;
    const memberUids = memberUidsOrErr;
    const perUser = Math.min(40, limit + 20);
    type HeartRow = { docId: string; fileId: string; createdAtMs: number };
    const rowLists = await Promise.all(
      memberUids.map(async (memberUid) => {
        const snap = await db
          .collection("file_hearts")
          .where("userId", "==", memberUid)
          .orderBy("createdAt", "desc")
          .limit(perUser)
          .get();
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            docId: d.id,
            fileId: data.fileId as string,
            createdAtMs: heartDocCreatedMs(data),
          };
        });
      })
    );
    const byFile = new Map<string, HeartRow>();
    for (const rows of rowLists) {
      for (const r of rows) {
        if (!r.fileId) continue;
        const prev = byFile.get(r.fileId);
        if (!prev || r.createdAtMs > prev.createdAtMs) byFile.set(r.fileId, r);
      }
    }
    const merged = [...byFile.values()].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, limit);
    const fileIds = merged.map((m) => m.fileId);
    const files = await hydrateHeartFileIds(uid, email, fileIds);
    return NextResponse.json({
      files,
      nextCursor: null,
      hasMore: false,
    });
  }

  if (workspaceScope !== "" && workspaceScope !== "personal") {
    return NextResponse.json({ error: "Invalid workspace_scope" }, { status: 400 });
  }

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

  const files = await hydrateHeartFileIds(uid, email, fileIds);

  const lastDoc = docs[docs.length - 1];
  return NextResponse.json({
    files,
    nextCursor: hasMore && lastDoc ? lastDoc.id : null,
    hasMore,
  });
}
