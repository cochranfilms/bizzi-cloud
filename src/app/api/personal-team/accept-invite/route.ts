/**
 * POST /api/personal-team/accept-invite — redeem pending email invite after sign-in.
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/invite-token";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team";
import {
  seatStatusAllowsEnter,
  wouldExceedNonOwnedTeamCap,
} from "@/lib/personal-team-auth";
import { isPersonalTeamSeatAccess, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import { createNotification, getActorDisplayName } from "@/lib/notification-service";

async function requireAuth(request: Request): Promise<{ uid: string; email?: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid: memberUid, email: tokenEmail } = auth;

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rawToken = typeof body.token === "string" ? body.token.trim() : "";
  if (!rawToken) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  let memberEmail = (tokenEmail ?? "").toLowerCase();
  try {
    const rec = await getAdminAuth().getUser(memberUid);
    memberEmail = (rec.email ?? memberEmail).toLowerCase();
  } catch {
    return NextResponse.json({ error: "Could not load account" }, { status: 400 });
  }
  if (!memberEmail) {
    return NextResponse.json(
      { error: "Your account needs a verified email to accept this invite." },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const inviteHash = hashInviteToken(rawToken);
  const pendingSnap = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("invite_token_hash", "==", inviteHash)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (pendingSnap.empty) {
    return NextResponse.json(
      { error: "Invite not found or already used." },
      { status: 404 }
    );
  }

  const inviteDoc = pendingSnap.docs[0];
  const inv = inviteDoc.data();
  const invitedEmail = ((inv.invited_email as string) ?? "").toLowerCase();
  const teamOwnerUid = inv.team_owner_user_id as string;
  const levelRaw = inv.seat_access_level as string;

  if (invitedEmail !== memberEmail) {
    return NextResponse.json(
      {
        error:
          "This invite was sent to a different email address. Sign in with the invited email or ask your team admin to send a new invite.",
      },
      { status: 403 }
    );
  }

  if (!isPersonalTeamSeatAccess(levelRaw)) {
    return NextResponse.json({ error: "Invalid invite data." }, { status: 500 });
  }
  const seatLevel = levelRaw as PersonalTeamSeatAccess;

  if (memberUid === teamOwnerUid) {
    return NextResponse.json({ error: "Invalid invite." }, { status: 400 });
  }

  const existingSeatId = personalTeamSeatDocId(teamOwnerUid, memberUid);
  const existingSeatSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .doc(existingSeatId)
    .get();

  if (existingSeatSnap.exists) {
    const st = existingSeatSnap.data()?.status as string | undefined;
    if (seatStatusAllowsEnter(st)) {
      await inviteDoc.ref.set(
        {
          status: "accepted",
          accepted_user_id: memberUid,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await writeAuditLog({
        action: "personal_team_invite_accepted",
        uid: memberUid,
        ip: getClientIp(request),
        metadata: {
          route: "POST /api/personal-team/accept-invite",
          result: "allowed",
          idempotent: true,
          team_owner_user_id: teamOwnerUid,
        },
      });
      return NextResponse.json({
        ok: true,
        already_member: true,
        team_owner_user_id: teamOwnerUid,
      });
    }
  }

  if (await wouldExceedNonOwnedTeamCap(db, memberUid, teamOwnerUid)) {
    await writeAuditLog({
      action: "personal_team_membership_cap_blocked",
      uid: memberUid,
      ip: getClientIp(request),
      metadata: {
        route: "POST /api/personal-team/accept-invite",
        result: "blocked",
        team_owner_user_id: teamOwnerUid,
      },
    });
    return NextResponse.json(
      {
        error:
          "You are already on the maximum number of other personal teams (3). Leave one before accepting this invite.",
      },
      { status: 400 }
    );
  }

  const docId = personalTeamSeatDocId(teamOwnerUid, memberUid);
  const now = FieldValue.serverTimestamp();

  await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId).set(
    {
      team_id: teamOwnerUid,
      team_owner_user_id: teamOwnerUid,
      member_user_id: memberUid,
      seat_access_level: seatLevel,
      status: "active",
      invited_email: invitedEmail,
      created_at: now,
      updated_at: now,
    },
    { merge: true }
  );

  await inviteDoc.ref.set(
    {
      status: "accepted",
      accepted_user_id: memberUid,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAuditLog({
    action: "personal_team_invite_accepted",
    uid: memberUid,
    ip: getClientIp(request),
    metadata: {
      route: "POST /api/personal-team/accept-invite",
      result: "allowed",
      team_owner_user_id: teamOwnerUid,
      seat_access_level: seatLevel,
    },
  });

  const joinerLabel = await getActorDisplayName(db, memberUid);
  await createNotification({
    recipientUserId: teamOwnerUid,
    actorUserId: memberUid,
    type: "personal_team_joined_owner",
    metadata: {
      actorDisplayName: joinerLabel,
      newMemberDisplayName: joinerLabel,
    },
  }).catch((err) => console.error("[personal-team/accept-invite] notification:", err));

  return NextResponse.json({ ok: true, team_owner_user_id: teamOwnerUid });
}
