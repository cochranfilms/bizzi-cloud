/**
 * POST /api/personal-team/invite — team admin invites by email (existing account or pending signup).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { sendPersonalTeamInviteEmail } from "@/lib/emailjs";
import { hashInviteToken } from "@/lib/invite-token";
import {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
  validateTeamSeatCapacity,
} from "@/lib/personal-team";
import {
  isPersonalTeamSeatAccess,
  personalTeamSeatAccessSummary,
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";

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

const PLANS_WITH_TEAM = new Set(["indie", "video", "production"]);

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    "https://www.bizzicloud.io"
  );
}

async function hasPendingInviteForEmail(
  db: Firestore,
  ownerUid: string,
  email: string
): Promise<boolean> {
  const snap = await db
    .collection(PERSONAL_TEAM_INVITES_COLLECTION)
    .where("team_owner_user_id", "==", ownerUid)
    .where("status", "==", "pending")
    .get();
  return snap.docs.some(
    (d) => ((d.data().invited_email as string) ?? "").toLowerCase() === email
  );
}

async function sendTeamInviteMail(opts: {
  toEmail: string;
  inviterName: string;
  seatLevel: PersonalTeamSeatAccess;
  ctaUrl: string;
  ctaLabel: string;
}) {
  await sendPersonalTeamInviteEmail({
    to_email: opts.toEmail,
    inviter_name: opts.inviterName,
    seat_access_label: PERSONAL_TEAM_SEAT_ACCESS_LABELS[opts.seatLevel],
    what_they_get: personalTeamSeatAccessSummary(opts.seatLevel),
    cta_url: opts.ctaUrl,
    cta_label: opts.ctaLabel,
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid: adminUid, email: adminEmailFromToken } = auth;

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

  let adminAuthEmail = (adminEmailFromToken ?? "").toLowerCase();
  try {
    const adminRecord = await getAdminAuth().getUser(adminUid);
    adminAuthEmail = (adminRecord.email ?? adminAuthEmail).toLowerCase();
  } catch {
    /* ignore */
  }
  if (email === adminAuthEmail) {
    return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
  }

  if (await hasPendingInviteForEmail(db, adminUid, email)) {
    return NextResponse.json(
      { error: "An invite is already pending for this email." },
      { status: 400 }
    );
  }

  const capErr = await validateTeamSeatCapacity(adminUid, adminData, seatLevel);
  if (capErr) {
    return NextResponse.json({ error: capErr }, { status: 400 });
  }

  const inviterName =
    (adminData.display_name as string)?.trim() ||
    (adminData.displayName as string)?.trim() ||
    adminEmailFromToken?.split("@")[0] ||
    "Your teammate";

  let memberUid: string | null = null;
  try {
    const userRecord = await getAdminAuth().getUserByEmail(email);
    memberUid = userRecord.uid;
  } catch {
    memberUid = null;
  }

  if (memberUid) {
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
    const dashUrl = `${appBaseUrl()}/dashboard`;
    try {
      await sendTeamInviteMail({
        toEmail: email,
        inviterName,
        seatLevel,
        ctaUrl: dashUrl,
        ctaLabel: "Open your Bizzi dashboard",
      });
    } catch (err) {
      console.error("[personal-team/invite] EmailJS failed:", err);
      return NextResponse.json(
        {
          error:
            "Failed to send invite email. Check EMAILJS_TEMPLATE_ID_PERSONAL_TEAM_INVITE and EmailJS dashboard.",
        },
        { status: 500 }
      );
    }

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

    return NextResponse.json({
      ok: true,
      member_user_id: memberUid,
      pending_invite: false,
    });
  }

  const inviteToken = crypto.randomUUID();
  const inviteTokenHash = hashInviteToken(inviteToken);
  const pendingId = `${adminUid}_pt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = FieldValue.serverTimestamp();
  const inviteLink = `${appBaseUrl()}/invite/team?token=${encodeURIComponent(inviteToken)}`;

  await db.collection(PERSONAL_TEAM_INVITES_COLLECTION).doc(pendingId).set({
    team_owner_user_id: adminUid,
    invited_email: email,
    seat_access_level: seatLevel,
    invite_token_hash: inviteTokenHash,
    status: "pending",
    created_at: now,
    updated_at: now,
  });

  try {
    await sendTeamInviteMail({
      toEmail: email,
      inviterName,
      seatLevel,
      ctaUrl: inviteLink,
      ctaLabel: "Create account and join your team",
    });
  } catch (err) {
    console.error("[personal-team/invite] EmailJS failed (pending):", err);
    await db.collection(PERSONAL_TEAM_INVITES_COLLECTION).doc(pendingId).delete();
    return NextResponse.json(
      {
        error:
          "Failed to send invite email. Check EMAILJS_TEMPLATE_ID_PERSONAL_TEAM_INVITE configuration.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    pending_invite: true,
    invite_id: pendingId,
  });
}
