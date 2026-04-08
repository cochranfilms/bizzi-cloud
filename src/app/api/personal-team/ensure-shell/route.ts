/**
 * POST /api/personal-team/ensure-shell
 * Explicit intent: create `personal_teams/{uid}` when the signed-in user is the owner and plan allows team shell.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { ensurePersonalTeamShellOnUserIntent, getOwnedPersonalTeamShellState } from "@/lib/personal-team-auth";
import { copyWorkspaceDisplayNameToTeamSettingsIfEmpty } from "@/lib/sync-workspace-display-name-to-team-settings";

export async function POST(request: Request) {
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

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const pdata = profileSnap.data() ?? {};
  const ok = await ensurePersonalTeamShellOnUserIntent(db, uid, pdata);
  if (!ok) {
    return NextResponse.json(
      { error: "Your plan does not support a personal team workspace yet." },
      { status: 403 }
    );
  }
  await copyWorkspaceDisplayNameToTeamSettingsIfEmpty(db, uid);
  const state = await getOwnedPersonalTeamShellState(db, uid);
  return NextResponse.json({
    ok: true,
    team_shell_exists: state.team_shell_exists,
    team_seats_enabled: state.team_seats_enabled,
    team_setup_mode: state.team_setup_mode,
    owner_allowed_into_shell: state.owner_allowed_into_shell,
  });
}
