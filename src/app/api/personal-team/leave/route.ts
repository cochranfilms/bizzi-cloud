/**
 * POST /api/personal-team/leave — team member leaves; access revocation only.
 * Body: { team_owner_user_id: string } — which team to leave.
 *
 * Leaving does not migrate the team container to cold storage; that runs only on team
 * shutdown / billing-driven finalize flows (see finalizePersonalTeamColdStorage).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { suggestIdentityDeletionAfterTeamScopeRemoved } from "@/lib/identity-scope";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId } from "@/lib/personal-team";
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
  const { uid: memberUid } = auth;

  let body: { team_owner_user_id?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const teamOwnerUid =
    typeof body.team_owner_user_id === "string" ? body.team_owner_user_id.trim() : "";
  if (!teamOwnerUid) {
    return NextResponse.json({ error: "team_owner_user_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(memberUid).get();
  const profileData = profileSnap.data();

  const docId = personalTeamSeatDocId(teamOwnerUid, memberUid);
  const seatRef = db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId);
  const seatSnap = await seatRef.get();
  const seat = seatSnap.data();
  if (!seatSnap.exists || seat?.member_user_id !== memberUid || seat?.team_owner_user_id !== teamOwnerUid) {
    return NextResponse.json({ error: "You are not on that team." }, { status: 404 });
  }

  const st = seat?.status as string | undefined;
  if (st === "removed") {
    await db.collection("profiles").doc(memberUid).set(
      {
        personal_team_owner_id: FieldValue.delete(),
        personal_team_seat_access: FieldValue.delete(),
      },
      { merge: true }
    );
    await writeAuditLog({
      action: "personal_team_member_left",
      uid: memberUid,
      ip: getClientIp(request),
      metadata: {
        route: "POST /api/personal-team/leave",
        result: "allowed",
        idempotent: true,
        team_owner_user_id: teamOwnerUid,
      },
    });
    return NextResponse.json({
      ok: true,
      already_left: true,
      suggestIdentityDeletion: suggestIdentityDeletionAfterTeamScopeRemoved(
        profileData?.personal_status as string | undefined,
        profileData?.organization_id as string | undefined
      ),
    });
  }

  const personalStatus = profileData?.personal_status as string | undefined;
  const organizationId = profileData?.organization_id as string | undefined;

  try {
    await seatRef.set(
      {
        status: "removed",
        removed_at: FieldValue.serverTimestamp(),
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
      action: "personal_team_member_left",
      uid: memberUid,
      ip: getClientIp(request),
      metadata: {
        route: "POST /api/personal-team/leave",
        result: "allowed",
        team_owner_user_id: teamOwnerUid,
      },
    });
    const leaverLabel = await getActorDisplayName(db, memberUid);
    await createNotification({
      recipientUserId: teamOwnerUid,
      actorUserId: memberUid,
      type: "personal_team_member_left_owner",
      metadata: {
        actorDisplayName: leaverLabel,
        newMemberDisplayName: leaverLabel,
      },
    }).catch((err) => console.error("[personal-team/leave] notification:", err));

    return NextResponse.json({
      ok: true,
      suggestIdentityDeletion: suggestIdentityDeletionAfterTeamScopeRemoved(
        personalStatus,
        organizationId
      ),
    });
  } catch (err) {
    console.error("[personal-team/leave]", err);
    return NextResponse.json({ error: "Failed to leave team" }, { status: 500 });
  }
}
