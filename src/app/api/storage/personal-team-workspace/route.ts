/**
 * GET /api/storage/personal-team-workspace?team_owner_id=
 * Team workspace storage totals (owner quota + usage that bills to the owner).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  getPersonalTeamWorkspaceStorageSummary,
  deprecatedStorageFieldsFromSummary,
} from "@/lib/storage-display";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const teamOwnerId = new URL(request.url).searchParams.get("team_owner_id")?.trim();
  if (!teamOwnerId) {
    return NextResponse.json({ error: "team_owner_id required" }, { status: 400 });
  }

  if (uid !== teamOwnerId) {
    const db = getAdminFirestore();
    const seatSnap = await db
      .collection(PERSONAL_TEAM_SEATS_COLLECTION)
      .doc(personalTeamSeatDocId(teamOwnerId, uid))
      .get();
    const st = seatSnap.data()?.status as string | undefined;
    if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const summary = await getPersonalTeamWorkspaceStorageSummary(teamOwnerId, uid);
  const deprecated = deprecatedStorageFieldsFromSummary(summary);

  return NextResponse.json({
    ...summary,
    _deprecated: {
      storage_used_bytes: deprecated.storage_used_bytes,
      storage_used_total_for_quota: deprecated.storage_used_total_for_quota,
      storage_quota_bytes: summary.quota_bytes,
    },
  });
}
