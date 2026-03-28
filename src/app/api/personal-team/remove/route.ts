/**
 * POST /api/personal-team/remove — admin removes a member; access revocation only.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { suggestIdentityDeletionAfterTeamScopeRemoved } from "@/lib/identity-scope";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId } from "@/lib/personal-team";
import { canManagePersonalTeam, ensurePersonalTeamRecord } from "@/lib/personal-team-auth";
import { createNotification, getActorDisplayName } from "@/lib/notification-service";

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

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid: adminUid } = auth;

  let body: { member_user_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const memberUid = typeof body.member_user_id === "string" ? body.member_user_id.trim() : "";
  if (!memberUid) {
    return NextResponse.json({ error: "member_user_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const adminProfileSnap = await db.collection("profiles").doc(adminUid).get();
  const adminData = adminProfileSnap.data() ?? {};
  await ensurePersonalTeamRecord(db, adminUid, adminData);
  if (!(await canManagePersonalTeam(db, adminUid, adminUid))) {
    return NextResponse.json({ error: "Only the team admin can remove members." }, { status: 403 });
  }

  const docId = personalTeamSeatDocId(adminUid, memberUid);
  const seatRef = db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId);
  const seatSnap = await seatRef.get();
  const seat = seatSnap.data();
  if (!seatSnap.exists || seat?.team_owner_user_id !== adminUid) {
    return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  }

  const st = seat?.status as string | undefined;
  if (st === "removed") {
    await writeAuditLog({
      action: "personal_team_member_removed",
      uid: adminUid,
      ip: getClientIp(request),
      metadata: {
        route: "POST /api/personal-team/remove",
        result: "allowed",
        idempotent: true,
        target_user_id: memberUid,
        team_owner_user_id: adminUid,
      },
    });
    return NextResponse.json({ ok: true, already_removed: true });
  }

  const memberProfileSnap = await db.collection("profiles").doc(memberUid).get();
  const memberProfile = memberProfileSnap.data();
  const personalStatus = memberProfile?.personal_status as string | undefined;
  const organizationId = memberProfile?.organization_id as string | undefined;

  try {
    await seatRef.set(
      {
        status: "removed",
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await db.collection("profiles").doc(memberUid).set(
      {
        personal_team_owner_id: FieldValue.delete(),
        personal_team_seat_access: FieldValue.delete(),
      },
      { merge: true }
    );
    await writeAuditLog({
      action: "personal_team_member_removed",
      uid: adminUid,
      ip: getClientIp(request),
      metadata: {
        route: "POST /api/personal-team/remove",
        result: "allowed",
        target_user_id: memberUid,
        team_owner_user_id: adminUid,
      },
    });
    const ownerLabel = await getActorDisplayName(db, adminUid);
    await createNotification({
      recipientUserId: memberUid,
      actorUserId: adminUid,
      type: "personal_team_you_were_removed",
      metadata: { actorDisplayName: ownerLabel },
    }).catch((err) => console.error("[personal-team/remove] notification:", err));

    return NextResponse.json({
      ok: true,
      suggestIdentityDeletion: suggestIdentityDeletionAfterTeamScopeRemoved(
        personalStatus,
        organizationId
      ),
    });
  } catch (err) {
    console.error("[personal-team/remove]", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
