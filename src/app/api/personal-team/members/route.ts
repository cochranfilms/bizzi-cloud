/**
 * GET /api/personal-team/members — list team members (admin only).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team";

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

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const db = getAdminFirestore();
  const profile = await db.collection("profiles").doc(uid).get();
  if (profile.data()?.personal_team_owner_id) {
    return NextResponse.json({ error: "Only the team admin can list members." }, { status: 403 });
  }

  const snap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", uid)
    .get();

  const members = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      member_user_id: data.member_user_id as string,
      seat_access_level: data.seat_access_level as string,
      status: data.status as string,
      invited_email: data.invited_email as string | undefined,
    };
  });

  return NextResponse.json({ members });
}
