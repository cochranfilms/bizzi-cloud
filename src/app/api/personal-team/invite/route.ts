/**
 * POST /api/personal-team/invite — team admin invites an existing Bizzi user by email.
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
  validateTeamSeatCapacity,
} from "@/lib/personal-team";
import { isPersonalTeamSeatAccess, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";

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

const PLANS_WITH_TEAM = new Set(["indie", "video", "production"]);

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid: adminUid } = auth;

  let body: { email?: string; seat_access_level?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const levelRaw = typeof body.seat_access_level === "string" ? body.seat_access_level : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!isPersonalTeamSeatAccess(levelRaw)) {
    return NextResponse.json({ error: "Invalid seat_access_level" }, { status: 400 });
  }
  const seatLevel = levelRaw as PersonalTeamSeatAccess;

  const db = getAdminFirestore();
  const adminProfile = await db.collection("profiles").doc(adminUid).get();
  const adminData = adminProfile.data() ?? {};
  const planId = (adminData.plan_id as string) ?? "free";
  if (!PLANS_WITH_TEAM.has(planId)) {
    return NextResponse.json(
      { error: "Your plan does not support team seats." },
      { status: 403 }
    );
  }
  if (adminData.personal_team_owner_id) {
    return NextResponse.json(
      { error: "Team members cannot invite to someone else's team from this account." },
      { status: 403 }
    );
  }

  const capErr = await validateTeamSeatCapacity(adminUid, adminData, seatLevel);
  if (capErr) {
    return NextResponse.json({ error: capErr }, { status: 400 });
  }

  let memberUid: string;
  try {
    const userRecord = await getAdminAuth().getUserByEmail(email);
    memberUid = userRecord.uid;
  } catch {
    return NextResponse.json(
      { error: "That email is not registered. The teammate needs a Bizzi account first." },
      { status: 400 }
    );
  }

  if (memberUid === adminUid) {
    return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
  }

  const memberProfile = await db.collection("profiles").doc(memberUid).get();
  const memberData = memberProfile.data();
  const existingOwner = memberData?.personal_team_owner_id as string | undefined;
  if (existingOwner && existingOwner === adminUid) {
    return NextResponse.json({ error: "This user is already on your team." }, { status: 400 });
  }
  if (existingOwner && existingOwner !== adminUid) {
    return NextResponse.json(
      { error: "This user is already on another personal team." },
      { status: 400 }
    );
  }

  const docId = personalTeamSeatDocId(adminUid, memberUid);
  const seatRef = db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId);
  const now = FieldValue.serverTimestamp();

  await seatRef.set(
    {
      team_owner_user_id: adminUid,
      member_user_id: memberUid,
      seat_access_level: seatLevel,
      status: "active",
      invited_email: email,
      created_at: now,
      updated_at: now,
    },
    { merge: true }
  );

  await db.collection("profiles").doc(memberUid).set(
    {
      personal_team_owner_id: adminUid,
      personal_team_seat_access: seatLevel,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, member_user_id: memberUid });
}
