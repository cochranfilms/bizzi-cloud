import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkInviteRateLimit } from "@/lib/enterprise-invite-rate-limit";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import {
  findPendingInvitesByOrgAndEmail,
  findPendingOrgInviteByToken,
} from "@/lib/organization-invites";
import { assertAtMostOneActiveSeatPerUser } from "@/lib/org-seat-integrity";
import { syncOrganizationSeatAllocationSummary } from "@/lib/org-seat-allocation-summary";
import { ensureDefaultDrivesForOrgUser } from "@/lib/ensure-default-drives";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  createNotification,
  getActorDisplayName,
  getOrganizationAdminUserIds,
} from "@/lib/notification-service";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";
import type { OrganizationSeatQuotaMode } from "@/lib/enterprise-constants";

function seatFieldsFromPending(
  pending: Record<string, unknown>,
  acceptedRole: "admin" | "member"
): { quota_mode: OrganizationSeatQuotaMode; storage_quota_bytes: number | null } {
  if (acceptedRole === "admin") {
    return { quota_mode: "org_unlimited", storage_quota_bytes: null };
  }
  const intendedMode = pending.intended_quota_mode as string | undefined;
  const intendedBytes = pending.intended_storage_quota_bytes;
  const legacyBytes = pending.storage_quota_bytes;
  if (intendedMode === "org_unlimited") {
    return { quota_mode: "org_unlimited", storage_quota_bytes: null };
  }
  const bytes =
    typeof intendedBytes === "number"
      ? intendedBytes
      : typeof legacyBytes === "number"
        ? legacyBytes
        : DEFAULT_SEAT_STORAGE_BYTES;
  return { quota_mode: "fixed", storage_quota_bytes: bytes };
}

/** POST - Accept a pending invite to join an organization. */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const acceptRl = await checkInviteRateLimit("accept_invite", uid, 25, 60_000);
  if (!acceptRl.ok) {
    logEnterpriseSecurityEvent("invite_rate_limited", {
      uid,
      kind: "accept_invite",
      retryAfterSec: acceptRl.retryAfterSec,
    });
    return NextResponse.json(
      {
        error: "Too many requests. Try again in a moment.",
        retry_after_sec: acceptRl.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(acceptRl.retryAfterSec) } }
    );
  }

  let body: { organization_id?: string; invite_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const inviteToken = typeof body.invite_token === "string" ? body.invite_token.trim() : "";
  const orgIdParam = typeof body.organization_id === "string" ? body.organization_id.trim() : "";

  const db = getAdminFirestore();

  let orgId: string;
  let pendingDocs: QueryDocumentSnapshot[];

  if (inviteToken) {
    const pendingSeat = await findPendingOrgInviteByToken(db, inviteToken);

    if (pendingSeat) {
      const seatData = pendingSeat.data();
      const inviteEmail = (seatData.email as string)?.toLowerCase() ?? "";
      if (inviteEmail && email?.toLowerCase() !== inviteEmail) {
        return NextResponse.json(
          { error: "This invite was sent to a different email address" },
          { status: 403 }
        );
      }
      orgId = seatData.organization_id as string;
      pendingDocs = [pendingSeat];
    } else if (orgIdParam && email) {
      pendingDocs = await findPendingInvitesByOrgAndEmail(db, orgIdParam, email.toLowerCase());
      if (pendingDocs.length === 0) {
        return NextResponse.json(
          { error: "Invite not found or already accepted" },
          { status: 404 }
        );
      }
      orgId = orgIdParam;
    } else {
      return NextResponse.json(
        { error: "Invite not found or already accepted" },
        { status: 404 }
      );
    }
  } else if (orgIdParam) {
    orgId = orgIdParam;
    pendingDocs = await findPendingInvitesByOrgAndEmail(
      db,
      orgId,
      (email ?? "").toLowerCase()
    );
  } else {
    return NextResponse.json(
      { error: "organization_id or invite_token is required" },
      { status: 400 }
    );
  }

  if (pendingDocs.length === 0) {
    return NextResponse.json(
      { error: "No pending invite found for this organization" },
      { status: 404 }
    );
  }

  const pendingSeatData = pendingDocs[0].data();
  const isOrgOwnerInvite = pendingSeatData.role === "admin";
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const currentOrgId = profileSnap.data()?.organization_id as string | undefined;

  if (currentOrgId) {
    if (currentOrgId === orgId) {
      return NextResponse.json(
        { error: "You already belong to this organization" },
        { status: 400 }
      );
    }
    if (isOrgOwnerInvite) {
      const oldSeatId = `${currentOrgId}_${uid}`;
      const oldSeatSnap = await db.collection("organization_seats").doc(oldSeatId).get();
      if (oldSeatSnap.exists) {
        const batch = db.batch();
        batch.delete(oldSeatSnap.ref);
        batch.set(profileSnap.ref, { organization_id: null, organization_role: null }, { merge: true });
        await batch.commit();
      } else {
        await profileSnap.ref.update({ organization_id: null, organization_role: null });
      }
    } else {
      return NextResponse.json(
        {
          error:
            "You already belong to another organization. You can only be in one organization at a time.",
        },
        { status: 400 }
      );
    }
  }

  const seatId = `${orgId}_${uid}`;
  const existingSeat = await db.collection("organization_seats").doc(seatId).get();
  if (existingSeat.exists && existingSeat.data()?.status === "active") {
    return NextResponse.json(
      { error: "You already belong to this organization" },
      { status: 400 }
    );
  }

  try {
    await assertAtMostOneActiveSeatPerUser(db, orgId, uid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Seat data error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const now = FieldValue.serverTimestamp();

  const batch = db.batch();

  for (const docSnap of pendingDocs) {
    batch.delete(docSnap.ref);
  }

  const acceptedRole =
    (pendingSeatData.role === "admin" ? "admin" : "member") as "admin" | "member";
  const { quota_mode, storage_quota_bytes } = seatFieldsFromPending(
    pendingSeatData as Record<string, unknown>,
    acceptedRole
  );
  const seatRef = db.collection("organization_seats").doc(seatId);
  batch.set(seatRef, {
    organization_id: orgId,
    user_id: uid,
    role: acceptedRole,
    email: email ?? "",
    display_name: null,
    invited_at: now,
    accepted_at: now,
    status: "active",
    quota_mode,
    storage_quota_bytes,
  });

  const profileRef = db.collection("profiles").doc(uid);
  batch.set(
    profileRef,
    {
      organization_id: orgId,
      organization_role: acceptedRole,
    },
    { merge: true }
  );

  await batch.commit();

  await syncOrganizationSeatAllocationSummary(db, orgId);

  const orgSnapForNotify = await db.collection("organizations").doc(orgId).get();
  const orgNameNotify = (orgSnapForNotify.data()?.name as string) ?? "Organization";
  const joinerLabel = await getActorDisplayName(db, uid);
  const adminUids = await getOrganizationAdminUserIds(db, orgId, uid);
  await Promise.all(
    adminUids.map((adminUid) =>
      createNotification({
        recipientUserId: adminUid,
        actorUserId: uid,
        type: "org_member_joined",
        metadata: {
          actorDisplayName: joinerLabel,
          newMemberDisplayName: joinerLabel,
          orgName: orgNameNotify,
          orgId,
        },
      }).catch((err) => console.error("[enterprise/accept-invite] admin notification:", err))
    )
  );

  const orgAddonIds = Array.isArray(orgSnapForNotify.data()?.addon_ids)
    ? (orgSnapForNotify.data()?.addon_ids as string[])
    : [];
  try {
    await ensureDefaultDrivesForOrgUser(uid, orgId, orgAddonIds);
  } catch (err) {
    console.error("[accept-invite] Failed to create default drives:", err);
  }

  logEnterpriseSecurityEvent("invite_accepted", {
    uid,
    orgId,
    via_invite_token: Boolean(inviteToken),
  });

  return NextResponse.json({
    success: true,
    organization_id: orgId,
  });
}
