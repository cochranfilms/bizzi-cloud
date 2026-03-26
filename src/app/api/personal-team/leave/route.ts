/**
 * POST /api/personal-team/leave — team member leaves; access revocation only.
 * Shared team files stay with the team container (no cold storage / transfer).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { suggestIdentityDeletionAfterTeamScopeRemoved } from "@/lib/identity-scope";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
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

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(memberUid).get();
  const profileData = profileSnap.data();
  const teamOwnerUid = profileData?.personal_team_owner_id as string | undefined;
  if (!teamOwnerUid) {
    return NextResponse.json({ error: "You are not on a personal team." }, { status: 400 });
  }

  const personalStatus = profileData?.personal_status as string | undefined;
  const organizationId = profileData?.organization_id as string | undefined;

  const docId = personalTeamSeatDocId(teamOwnerUid, memberUid);
  try {
    await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId).set(
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
