/**
 * POST /api/admin/personal-team-repair
 * Internal-only repairs for personal team identity drift. Requires admin auth.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { personalTeamSeatDocId } from "@/lib/personal-team-constants";
import {
  ensurePersonalTeamRecord,
  seatStatusCountsTowardMembershipCap,
} from "@/lib/personal-team-auth";

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: {
    action?: string;
    target_user_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const targetUserId =
    typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";
  if (!targetUserId) {
    return NextResponse.json({ error: "target_user_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ip = getClientIp(request);

  if (action === "strip_stale_profile_team_fields") {
    const profileSnap = await db.collection("profiles").doc(targetUserId).get();
    const data = profileSnap.data();
    const pto = (data?.personal_team_owner_id as string | undefined)?.trim();
    if (!pto) {
      return NextResponse.json({ ok: true, noop: true, reason: "no profile team pointer" });
    }
    const seatId = personalTeamSeatDocId(pto, targetUserId);
    const seat = await db.collection("personal_team_seats").doc(seatId).get();
    const st = seat.data()?.status as string | undefined;
    if (seat.exists && seatStatusCountsTowardMembershipCap(st)) {
      return NextResponse.json({ ok: true, noop: true, reason: "seat still active" });
    }
    await db.collection("profiles").doc(targetUserId).set(
      {
        personal_team_owner_id: FieldValue.delete(),
        personal_team_seat_access: FieldValue.delete(),
      },
      { merge: true }
    );
    await writeAuditLog({
      action: "personal_team_admin_repair",
      uid: auth.uid,
      ip,
      metadata: {
        route: "admin/personal-team-repair",
        repair_action: action,
        target_user_id: targetUserId,
        cleared_pointer_to: pto,
      },
    });
    return NextResponse.json({ ok: true, stripped: true });
  }

  if (action === "ensure_personal_team_row") {
    const profileSnap = await db.collection("profiles").doc(targetUserId).get();
    const created = await ensurePersonalTeamRecord(
      db,
      targetUserId,
      profileSnap.data() as Record<string, unknown> | undefined,
      { allowPlanBootstrap: true }
    );
    await writeAuditLog({
      action: "personal_team_admin_repair",
      uid: auth.uid,
      ip,
      metadata: {
        route: "admin/personal-team-repair",
        repair_action: action,
        target_user_id: targetUserId,
        record_created_or_existed: created,
      },
    });
    return NextResponse.json({ ok: true, ensured: created });
  }

  return NextResponse.json(
    { error: "Unknown action. Use strip_stale_profile_team_fields | ensure_personal_team_row" },
    { status: 400 }
  );
}
