/**
 * GET /api/personal-team/my-membership?owner_uid=
 * Read-only seat + contact info for the signed-in member (not the team admin listing API).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { sumQuotaCountedUserPersonalTeamBackupBytes } from "@/lib/backup-file-storage-bytes";

const ACTIVE_OR_LEGACY: Set<string> = new Set(["active", "cold_storage"]);

function timestampToIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }
  const withToDate = value as { toDate?: () => Date };
  if (typeof withToDate.toDate === "function") {
    const d = withToDate.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : null;
  }
  const sec =
    (value as { seconds?: number; _seconds?: number }).seconds ??
    (value as { _seconds?: number })._seconds;
  if (typeof sec === "number") {
    return new Date(sec * 1000).toISOString();
  }
  return null;
}

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

  const url = new URL(request.url);
  const ownerUid = (url.searchParams.get("owner_uid") ?? "").trim();
  if (!ownerUid) {
    return NextResponse.json({ error: "owner_uid required" }, { status: 400 });
  }

  if (uid === ownerUid) {
    return NextResponse.json({ error: "Use team owner tools for admin membership" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const seatId = personalTeamSeatDocId(ownerUid, uid);
  const seatSnap = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(seatId).get();
  const st = (seatSnap.data()?.status as string) ?? "";
  if (!seatSnap.exists || !ACTIVE_OR_LEGACY.has(st)) {
    return NextResponse.json({ error: "No active membership on this team" }, { status: 403 });
  }

  const data = seatSnap.data() ?? {};
  let storageUsedBytes = 0;
  if (st === "active") {
    storageUsedBytes = await sumQuotaCountedUserPersonalTeamBackupBytes(db, uid, ownerUid);
  }

  let ownerEmail: string | null = null;
  try {
    const owner = await getAdminAuth().getUser(ownerUid);
    ownerEmail = owner.email ?? null;
  } catch {
    ownerEmail = null;
  }

  return NextResponse.json({
    team_owner_user_id: ownerUid,
    seat_status: st,
    seat_access_level: (data.seat_access_level as string) ?? "none",
    storage_quota_bytes: (data.storage_quota_bytes as number | null | undefined) ?? null,
    storage_used_bytes: storageUsedBytes,
    member_since: timestampToIso(data.invite_accepted_at ?? data.created_at ?? data.updated_at),
    team_admin_email: ownerEmail,
  });
}
