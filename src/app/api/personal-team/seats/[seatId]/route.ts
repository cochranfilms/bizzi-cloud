/**
 * PATCH /api/personal-team/seats/[seatId] — team owner updates a member's storage cap (team pool).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team";
import {
  backfillPersonalTeamDocFromLegacyDrive,
  canManagePersonalTeam,
  ensurePersonalTeamShellOnUserIntent,
  ownerTeamSeatsEnabled,
} from "@/lib/personal-team-auth";
import { isProductSeatTierByte } from "@/lib/enterprise-constants";
import { validateProposedFixedSeatCap } from "@/lib/personal-team-pool-accounting";

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
  await backfillPersonalTeamDocFromLegacyDrive(db, adminUid);
  await ensurePersonalTeamShellOnUserIntent(db, adminUid, adminData);
  if (!(await canManagePersonalTeam(db, adminUid, adminUid))) {
    return NextResponse.json({ error: "Only the team admin can update seat storage." }, { status: 403 });
  }
  if (!(await ownerTeamSeatsEnabled(db, adminUid))) {
    return NextResponse.json(
      { error: "Purchase team seats before changing member storage allocation." },
      { status: 403 }
    );
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

  const newCap = newQuota === null ? null : newQuota;
  if (typeof newCap === "number") {
    const capCheck = await validateProposedFixedSeatCap(adminUid, adminData, newCap, {
      excludeSeatDocId: seatId,
    });
    if (!capCheck.ok) {
      return NextResponse.json({ error: capCheck.error }, { status: 400 });
    }
  }

  const quota_mode = newQuota === null ? "org_unlimited" : "fixed";
  await seatRef.set(
    { storage_quota_bytes: newQuota, quota_mode },
    { merge: true }
  );

  return NextResponse.json({ success: true });
}
