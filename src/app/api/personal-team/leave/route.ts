/**
 * POST /api/personal-team/leave — team member leaves; team uploads go to cold storage.
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
  const { uid: memberUid } = auth;

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(memberUid).get();
  const teamOwnerUid = profileSnap.data()?.personal_team_owner_id as string | undefined;
  if (!teamOwnerUid) {
    return NextResponse.json({ error: "You are not on a personal team." }, { status: 400 });
  }

  const adminProfile = await db.collection("profiles").doc(teamOwnerUid).get();
  const planTier = (adminProfile.data()?.plan_id as string) ?? "solo";

  try {
    const { migrated } = await migratePersonalTeamMemberUploadsToColdStorage(
      memberUid,
      teamOwnerUid,
      planTier
    );
    const docId = personalTeamSeatDocId(teamOwnerUid, memberUid);
    await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId).set(
      {
        status: "cold_storage",
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
    console.error("[personal-team/leave]", err);
    return NextResponse.json({ error: "Failed to leave team" }, { status: 500 });
  }
}
