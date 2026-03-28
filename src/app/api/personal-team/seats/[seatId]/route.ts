/**
 * PATCH /api/personal-team/seats/[seatId] — team owner updates a member's storage cap (team pool).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team";
import { canManagePersonalTeam, ensurePersonalTeamRecord } from "@/lib/personal-team-auth";
import { isProductSeatTierByte } from "@/lib/enterprise-constants";
import {
  sumPersonalTeamFixedSeatAllocations,
  teamOwnerPoolBytes,
} from "@/lib/personal-team-seat-storage";
import { seatNumericCapForEnforcement } from "@/lib/org-seat-quota";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ seatId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid: adminUid } = auth;

  const { seatId } = await params;
  if (!seatId?.trim()) {
    return NextResponse.json({ error: "Seat ID is required" }, { status: 400 });
  }

  let body: { storage_quota_bytes?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newQuota = body.storage_quota_bytes;
  const isValid =
    newQuota === null || (typeof newQuota === "number" && isProductSeatTierByte(newQuota));
  if (!isValid) {
    return NextResponse.json(
      {
        error:
          "storage_quota_bytes must be a supported tier (50GB–10TB) or null (Unlimited within team pool)",
      },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const adminProfileSnap = await db.collection("profiles").doc(adminUid).get();
  const adminData = adminProfileSnap.data() ?? {};
  await ensurePersonalTeamRecord(db, adminUid, adminData);
  if (!(await canManagePersonalTeam(db, adminUid, adminUid))) {
    return NextResponse.json({ error: "Only the team admin can update seat storage." }, { status: 403 });
  }

  const seatRef = db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(seatId);
  const seatSnap = await seatRef.get();
  const seat = seatSnap.data();
  if (!seatSnap.exists || seat?.team_owner_user_id !== adminUid) {
    return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  }

  const st = seat?.status as string | undefined;
  if (st !== "active") {
    return NextResponse.json(
      { error: "Only active members can have storage allocation updated." },
      { status: 400 }
    );
  }

  const targetUserId = seat?.member_user_id as string | undefined;
  if (!targetUserId || targetUserId === adminUid) {
    return NextResponse.json({ error: "Invalid seat" }, { status: 400 });
  }

  const prevCap = seatNumericCapForEnforcement(seat as Record<string, unknown>);
  const newCap = newQuota === null ? null : newQuota;
  const pool = teamOwnerPoolBytes(adminData);
  const allocatedExcluding = await sumPersonalTeamFixedSeatAllocations(adminUid, {
    excludeSeatDocId: seatId,
  });
  const newAllocated = newCap === null ? allocatedExcluding : allocatedExcluding + newCap;
  if (newAllocated > pool) {
    const poolTb = (pool / (1024 ** 4)).toFixed(1);
    return NextResponse.json(
      {
        error: `Total fixed seat allocation would exceed your team storage pool (${poolTb} TB). ${(
          allocatedExcluding / (1024 ** 4)
        ).toFixed(1)} TB is already allocated to other members or pending invites${
          typeof prevCap === "number"
            ? ` (this member currently holds ${(prevCap / (1024 ** 4)).toFixed(1)} TB)`
            : ""
        }.`,
      },
      { status: 400 }
    );
  }

  const quota_mode = newQuota === null ? "org_unlimited" : "fixed";
  await seatRef.set(
    { storage_quota_bytes: newQuota, quota_mode },
    { merge: true }
  );

  return NextResponse.json({ success: true });
}
