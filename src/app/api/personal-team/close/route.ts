/**
 * POST /api/personal-team/close — owner closes personal team workspace (dedicated shutdown flow).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/audit-log";
import { canManagePersonalTeam, ensurePersonalTeamRecord } from "@/lib/personal-team-auth";
import {
  CloseWorkspaceError,
  executePersonalTeamWorkspaceClose,
  isPersonalTeamFullyClosed,
} from "@/lib/personal-team-close-workspace";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
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
  const { uid: ownerUid } = auth;

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(ownerUid).get();
  const profile = profileSnap.data() ?? {};
  await ensurePersonalTeamRecord(db, ownerUid, profile, { allowPlanBootstrap: true });
  if (!(await canManagePersonalTeam(db, ownerUid, ownerUid))) {
    return NextResponse.json({ error: "Only the team owner can close the workspace." }, { status: 403 });
  }

  if (await isPersonalTeamFullyClosed(db, ownerUid)) {
    return NextResponse.json({
      ok: true,
      already_closed: true,
      invites_cancelled: 0,
      members_revoked: 0,
      message: "Team workspace is already shut down.",
    });
  }

  try {
    const result = await executePersonalTeamWorkspaceClose(ownerUid, {
      auditIp: getClientIp(request),
    });
    return NextResponse.json({
      ...result,
      actual_result_note:
        "Final billing changes (if any) appear on your billing history per Stripe processing.",
    });
  } catch (err) {
    if (err instanceof CloseWorkspaceError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    console.error("[personal-team/close]", err);
    return NextResponse.json({ error: "Failed to close team workspace." }, { status: 500 });
  }
}
