/**
 * POST /api/personal-team/remove — admin removes a member.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { migratePersonalTeamMemberUploadsToColdStorage } from "@/lib/cold-storage-migrate";
import { PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId } from "@/lib/personal-team";

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
  if ((await db.collection("profiles").doc(adminUid).get()).data()?.personal_team_owner_id) {
    return NextResponse.json({ error: "Only the team admin can remove members." }, { status: 403 });
  }

  const docId = personalTeamSeatDocId(adminUid, memberUid);
  const seatSnap = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId).get();
  const seat = seatSnap.data();
  if (!seatSnap.exists || seat?.team_owner_user_id !== adminUid) {
    return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  }

  const adminProfile = await db.collection("profiles").doc(adminUid).get();
  const planTier = (adminProfile.data()?.plan_id as string) ?? "solo";

  try {
    const { migrated } = await migratePersonalTeamMemberUploadsToColdStorage(
      memberUid,
      adminUid,
      planTier
    );
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
    return NextResponse.json({ ok: true, migrated });
  } catch (err) {
    console.error("[personal-team/remove]", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
