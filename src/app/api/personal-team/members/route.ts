/**
 * GET /api/personal-team/members — list team members, pending invites, and seat overview (admin only).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
} from "@/lib/personal-team";
import { canManagePersonalTeam, ensurePersonalTeamRecord } from "@/lib/personal-team-auth";
import { PLAN_LABELS } from "@/lib/pricing-data";
import {
  coerceTeamSeatCounts,
  emptyTeamSeatCounts,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";

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

const LEVELS: PersonalTeamSeatAccess[] = ["none", "gallery", "editor", "fullframe"];

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const db = getAdminFirestore();
  const profile = await db.collection("profiles").doc(uid).get();
  const pdata = profile.data() ?? {};
  await ensurePersonalTeamRecord(db, uid, pdata);
  if (!(await canManagePersonalTeam(db, uid, uid))) {
    return NextResponse.json({ error: "Only the team admin can list members." }, { status: 403 });
  }

  const snap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", uid)
    .get();

  const members: Array<{
    id: string;
    member_user_id: string;
    email: string;
    seat_access_level: string;
    status: string;
    invited_email: string | null;
  }> = [];

  for (const d of snap.docs) {
    const data = d.data();
    const memberUserId = (data.member_user_id as string) ?? "";
    let email = ((data.invited_email as string) ?? "").toLowerCase();
    if (memberUserId) {
      try {
        const u = await getAdminAuth().getUser(memberUserId);
        email = (u.email ?? email).toLowerCase();
      } catch {
        /* deleted user — keep invited_email */
      }
    }
    members.push({
      id: d.id,
      member_user_id: memberUserId,
      email,
      seat_access_level: (data.seat_access_level as string) ?? "none",
      status: (data.status as string) ?? "active",
      invited_email: typeof data.invited_email === "string" ? data.invited_email : null,
    });
  }

  const pendSnap = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", uid)
    .where("status", "==", "pending")
    .get();

  const pending_invites = pendSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      invited_email: (data.invited_email as string) ?? "",
      seat_access_level: (data.seat_access_level as string) ?? "none",
      created_at: data.created_at ?? null,
    };
  });

  const purchased = coerceTeamSeatCounts(pdata?.team_seat_counts ?? {});
  const used = { ...emptyTeamSeatCounts() };

  for (const m of members) {
    const st = m.status;
    if (st !== "active" && st !== "invited") continue;
    const lv = m.seat_access_level as PersonalTeamSeatAccess;
    if (LEVELS.includes(lv)) {
      used[lv] += 1;
    }
  }
  for (const p of pending_invites) {
    const lv = p.seat_access_level as PersonalTeamSeatAccess;
    if (LEVELS.includes(lv)) {
      used[lv] += 1;
    }
  }

  const planId = (pdata?.plan_id as string) ?? "free";

  return NextResponse.json({
    members,
    pending_invites,
    overview: {
      team_seat_counts: purchased,
      used,
      available: {
        none: Math.max(0, purchased.none - used.none),
        gallery: Math.max(0, purchased.gallery - used.gallery),
        editor: Math.max(0, purchased.editor - used.editor),
        fullframe: Math.max(0, purchased.fullframe - used.fullframe),
      },
      plan_id: planId,
      plan_label: PLAN_LABELS[planId] ?? planId,
    },
  });
}
