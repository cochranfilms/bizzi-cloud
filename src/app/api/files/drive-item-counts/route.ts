/**
 * GET /api/files/drive-item-counts
 * Per-drive visible file counts for enterprise members using workspace-scoped rules
 * (matches /api/files/filter). Avoids client-side aggregation 403s for non-admin seats.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertStorageLifecycleAllowsAccess } from "@/lib/storage-lifecycle";
import {
  getAccessibleWorkspaceIds,
  userHasActiveOrganizationSeat,
} from "@/lib/workspace-access";
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

  const rl = checkRateLimit(`drive-item-counts:${uid}`, 120, 60_000);
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
  const organizationId = url.searchParams.get("organization_id")?.trim();
  if (!organizationId) {
    return NextResponse.json({ error: "organization_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileOrgId = profileSnap.data()?.organization_id as string | undefined;
  const hasSeat = await userHasActiveOrganizationSeat(uid, organizationId);
  if (profileOrgId !== organizationId && !hasSeat) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const driveIdsParam = url.searchParams.get("drive_ids")?.trim();
  if (!driveIdsParam) {
    return NextResponse.json({ counts: {} });
  }
  const driveIds = driveIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (driveIds.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(uid, organizationId);

  async function countForDrive(driveId: string): Promise<number> {
    if (accessibleWorkspaceIds.length === 0) {
      const anyWorkspaces = await db
        .collection("workspaces")
        .where("organization_id", "==", organizationId)
        .limit(1)
        .get();
      if (anyWorkspaces.empty) {
        const agg = await db
          .collection("backup_files")
          .where("linked_drive_id", "==", driveId)
          .where("userId", "==", uid)
          .where("organization_id", "==", organizationId)
          .where("deleted_at", "==", null)
          .count()
          .get();
        return agg.data().count;
      }
      return 0;
    }

    if (accessibleWorkspaceIds.length <= WORKSPACE_IN_LIMIT) {
      const agg = await db
        .collection("backup_files")
        .where("linked_drive_id", "==", driveId)
        .where("organization_id", "==", organizationId)
        .where("deleted_at", "==", null)
        .where("workspace_id", "in", accessibleWorkspaceIds)
        .count()
        .get();
      return agg.data().count;
    }

    let total = 0;
    for (let i = 0; i < accessibleWorkspaceIds.length; i += WORKSPACE_IN_LIMIT) {
      const batch = accessibleWorkspaceIds.slice(i, i + WORKSPACE_IN_LIMIT);
      const agg = await db
        .collection("backup_files")
        .where("linked_drive_id", "==", driveId)
        .where("organization_id", "==", organizationId)
        .where("deleted_at", "==", null)
        .where("workspace_id", "in", batch)
        .count()
        .get();
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
