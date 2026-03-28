/**
 * POST /api/personal-team/invite — team admin invites by email (existing account or pending signup).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { sendPersonalTeamInviteEmail } from "@/lib/emailjs";
import { hashInviteToken } from "@/lib/invite-token";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import {
  PERSONAL_TEAM_INVITES_COLLECTION,
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
  validateTeamSeatCapacity,
} from "@/lib/personal-team";
import {
  canManagePersonalTeam,
  ensurePersonalTeamRecord,
  wouldExceedNonOwnedTeamCap,
} from "@/lib/personal-team-auth";
import { isProductSeatTierByte } from "@/lib/enterprise-constants";
import { validateProposedFixedSeatCap } from "@/lib/personal-team-pool-accounting";
import {
  isPersonalTeamSeatAccess,
  personalTeamSeatAccessSummary,
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";
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

  let body: { email?: string; seat_access_level?: string; storage_quota_bytes?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const levelRaw = typeof body.seat_access_level === "string" ? body.seat_access_level : "";

  let inviteStorage: { storage_quota_bytes: number | null; quota_mode: "fixed" | "org_unlimited" };
  if (body.storage_quota_bytes === undefined || body.storage_quota_bytes === null) {
    inviteStorage = { storage_quota_bytes: null, quota_mode: "org_unlimited" };
  } else if (
    typeof body.storage_quota_bytes === "number" &&
    isProductSeatTierByte(body.storage_quota_bytes)
  ) {
    inviteStorage = { storage_quota_bytes: body.storage_quota_bytes, quota_mode: "fixed" };
  } else {
    return NextResponse.json(
      {
        error:
          "storage_quota_bytes must be a supported tier (50GB–10TB) or null (Unlimited within team pool)",
      },
      { status: 400 }
    );
  }
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

  await ensurePersonalTeamRecord(db, adminUid, adminData, { allowPlanBootstrap: true });
  if (!(await canManagePersonalTeam(db, adminUid, adminUid))) {
    await writeAuditLog({
      action: "personal_team_invite_blocked",
      uid: adminUid,
      ip: getClientIp(request),
      metadata: {
        route: "POST /api/personal-team/invite",
        result: "blocked",
        reason: "not_team_owner",
        team_owner_user_id: adminUid,
      },
    });
    return NextResponse.json(
      { error: "You do not have a personal team workspace to manage yet." },
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

  if (inviteStorage.quota_mode === "fixed" && typeof inviteStorage.storage_quota_bytes === "number") {
    const capCheck = await validateProposedFixedSeatCap(
      adminUid,
      adminData,
      inviteStorage.storage_quota_bytes
    );
    if (!capCheck.ok) {
      return NextResponse.json({ error: capCheck.error }, { status: 400 });
    }
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

    if (await wouldExceedNonOwnedTeamCap(db, memberUid, adminUid)) {
      await writeAuditLog({
        action: "personal_team_membership_cap_blocked",
        uid: adminUid,
        ip: getClientIp(request),
        metadata: {
          route: "POST /api/personal-team/invite",
          result: "blocked",
          target_user_id: memberUid,
          team_owner_user_id: adminUid,
        },
      });
      return NextResponse.json(
        {
          error:
            "This user is already on the maximum number of other personal teams (3). They must leave one before joining yours.",
        },
        { status: 400 }
      );
    }

    const existingSeatId = personalTeamSeatDocId(adminUid, memberUid);
    const existingSeat = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(existingSeatId).get();
    if (existingSeat.exists) {
      const st = existingSeat.data()?.status as string | undefined;
      if (st === "active" || st === "invited") {
        return NextResponse.json({ error: "This user is already on your team." }, { status: 400 });
      }
    }
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
    storage_quota_bytes: inviteStorage.storage_quota_bytes,
    quota_mode: inviteStorage.quota_mode,
    created_at: now,
    updated_at: now,
  });

  const ctaLabel = memberUid ? "Accept invitation" : "Create account and join your team";

  try {
    await sendTeamInviteMail({
      toEmail: email,
      inviterName,
      seatLevel,
      ctaUrl: inviteLink,
      ctaLabel,
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

  await writeAuditLog({
    action: "personal_team_invite_created",
    uid: adminUid,
    ip: getClientIp(request),
    metadata: {
      route: "POST /api/personal-team/invite",
      result: "allowed",
      pending_invite_id: pendingId,
      team_owner_user_id: adminUid,
      seat_access_level: seatLevel,
      known_existing_user: !!memberUid,
    },
  });

  if (memberUid) {
    const ownerLabel = await getActorDisplayName(db, adminUid);
    await createNotification({
      recipientUserId: memberUid,
      actorUserId: adminUid,
      type: "personal_team_invited",
      metadata: {
        actorDisplayName: ownerLabel,
        teamOwnerUserId: adminUid,
      },
    }).catch((err) => console.error("[personal-team/invite] notification:", err));
  }

  return NextResponse.json({
    ok: true,
    pending_invite: true,
    invite_id: pendingId,
  });
}
