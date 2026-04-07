/**
 * GET /api/personal-team/shell-state?owner_uid=
 * Same shell flags as workspaces (uses getOwnedPersonalTeamShellState). Does not create shell from plan alone.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { getOwnedPersonalTeamShellState, canEnterPersonalTeam } from "@/lib/personal-team-auth";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ownerUid = (url.searchParams.get("owner_uid") ?? "").trim();
  if (!ownerUid) {
    return NextResponse.json({ error: "owner_uid required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (uid === ownerUid) {
    const state = await getOwnedPersonalTeamShellState(db, ownerUid);
    return NextResponse.json({
      role: "owner" as const,
      ...state,
    });
  }

  const memberAllowed = await canEnterPersonalTeam(db, uid, ownerUid);
  if (!memberAllowed) {
    return NextResponse.json({
      role: "member" as const,
      team_shell_exists: false,
      team_seats_enabled: false,
      team_setup_mode: false,
      owner_allowed_into_shell: false,
    });
  }
  const ownerState = await getOwnedPersonalTeamShellState(db, ownerUid);
  return NextResponse.json({
    role: "member" as const,
    team_shell_exists: ownerState.team_shell_exists,
    team_seats_enabled: ownerState.team_seats_enabled,
    team_setup_mode: ownerState.team_setup_mode,
    owner_allowed_into_shell: true,
  });
}
