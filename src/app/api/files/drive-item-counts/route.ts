/**
 * GET /api/files/drive-item-counts
 * Per-drive file counts using Admin SDK and the same access rules as /api/files/filter.
 * Avoids client-side getCountFromServer / runAggregationQuery 403s for org seats and team routes.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertStorageLifecycleAllowsAccess } from "@/lib/storage-lifecycle";
import {
  getAccessibleWorkspaceIds,
  userHasActiveOrganizationSeat,
} from "@/lib/workspace-access";
import { isTeamContainerDriveDoc } from "@/lib/backup-scope";
import { NextResponse } from "next/server";

const WORKSPACE_IN_LIMIT = 30;

export async function GET(request: Request) {
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

  const rl = checkRateLimit(`drive-item-counts:${uid}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    await assertStorageLifecycleAllowsAccess(uid);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Access restricted" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id")?.trim() || null;
  const teamOwnerId = url.searchParams.get("team_owner_id")?.trim() || null;
  const workspaceNarrowId = url.searchParams.get("workspace_id")?.trim() || null;
  const personal = url.searchParams.get("personal") === "1";
  const trashOnly = url.searchParams.get("deleted") === "only";

  const driveIdsParam = url.searchParams.get("drive_ids")?.trim();
  if (!driveIdsParam) {
    return NextResponse.json({ counts: {} });
  }
  const driveIds = driveIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (driveIds.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  const db = getAdminFirestore();

  /** Personal-account drives (no org): avoids client getCountFromServer failed-precondition on trash counts. */
  if (personal) {
    if (organizationId || teamOwnerId) {
      return NextResponse.json(
        { error: "Do not pass organization_id or team_owner_id with personal=1" },
        { status: 400 }
      );
    }
    const counts: Record<string, number> = {};
    await Promise.all(
      driveIds.map(async (driveId) => {
        const driveSnap = await db.collection("linked_drives").doc(driveId).get();
        const data = driveSnap.data();
        const owner = (data?.userId ?? data?.user_id) as string | undefined;
        if (!data || owner !== uid || data.organization_id) {
          counts[driveId] = 0;
          return;
        }
        const coll = db.collection("backup_files");
        const q = trashOnly
          ? coll.where("linked_drive_id", "==", driveId).where("deleted_at", "!=", null)
          : coll.where("linked_drive_id", "==", driveId).where("deleted_at", "==", null);
        const agg = await q.count().get();
        counts[driveId] = agg.data().count;
      })
    );
    return NextResponse.json({ counts });
  }

  if (organizationId && teamOwnerId) {
    return NextResponse.json(
      { error: "Specify organization_id or team_owner_id, not both" },
      { status: 400 }
    );
  }
  if (!organizationId && !teamOwnerId) {
    return NextResponse.json(
      { error: "organization_id or team_owner_id required" },
      { status: 400 }
    );
  }

  if (teamOwnerId) {
    if (uid !== teamOwnerId) {
      const seatSnap = await db
        .collection("personal_team_seats")
        .doc(`${teamOwnerId}_${uid}`)
        .get();
      const st = seatSnap.data()?.status as string | undefined;
      if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const counts: Record<string, number> = {};
    await Promise.all(
      driveIds.map(async (driveId) => {
        const driveSnap = await db.collection("linked_drives").doc(driveId).get();
        const data = driveSnap.data();
        if (
          !data ||
          data.userId !== teamOwnerId ||
          data.organization_id ||
          data.deleted_at ||
          !isTeamContainerDriveDoc(data as Record<string, unknown>, teamOwnerId)
        ) {
          counts[driveId] = 0;
          return;
        }
        const coll = db.collection("backup_files");
        const q = trashOnly
          ? coll
              .where("linked_drive_id", "==", driveId)
              .where("deleted_at", "!=", null)
          : coll
              .where("linked_drive_id", "==", driveId)
              .where("deleted_at", "==", null);
        const agg = await q.count().get();
        counts[driveId] = agg.data().count;
      })
    );
    return NextResponse.json({ counts });
  }

  const orgId = organizationId as string;
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileOrgId = profileSnap.data()?.organization_id as string | undefined;
  const hasSeat = await userHasActiveOrganizationSeat(uid, orgId);
  if (profileOrgId !== orgId && !hasSeat) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(uid, orgId);

  if (
    workspaceNarrowId &&
    !accessibleWorkspaceIds.includes(workspaceNarrowId)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  async function countForDrive(driveId: string): Promise<number> {
    const workspaceIdsForCount = workspaceNarrowId
      ? [workspaceNarrowId]
      : accessibleWorkspaceIds;

    if (workspaceIdsForCount.length === 0) {
      const anyWorkspaces = await db
        .collection("workspaces")
        .where("organization_id", "==", orgId)
        .limit(1)
        .get();
      if (anyWorkspaces.empty) {
        const coll = db.collection("backup_files");
        const base = coll
          .where("linked_drive_id", "==", driveId)
          .where("userId", "==", uid)
          .where("organization_id", "==", orgId);
        const q = trashOnly
          ? base.where("deleted_at", "!=", null)
          : base.where("deleted_at", "==", null);
        const agg = await q.count().get();
        return agg.data().count;
      }
      return 0;
    }

    const coll = db.collection("backup_files");
    const baseForBatch = (batch: string[]) => {
      const b = coll
        .where("linked_drive_id", "==", driveId)
        .where("organization_id", "==", orgId)
        .where("workspace_id", "in", batch);
      return trashOnly ? b.where("deleted_at", "!=", null) : b.where("deleted_at", "==", null);
    };

    if (workspaceIdsForCount.length <= WORKSPACE_IN_LIMIT) {
      const agg = await baseForBatch(workspaceIdsForCount).count().get();
      return agg.data().count;
    }

    let total = 0;
    for (let i = 0; i < workspaceIdsForCount.length; i += WORKSPACE_IN_LIMIT) {
      const batch = workspaceIdsForCount.slice(i, i + WORKSPACE_IN_LIMIT);
      const agg = await baseForBatch(batch).count().get();
      total += agg.data().count;
    }
    return total;
  }

  const counts: Record<string, number> = {};
  await Promise.all(
    driveIds.map(async (id) => {
      counts[id] = await countForDrive(id);
    })
  );

  return NextResponse.json({ counts });
}
