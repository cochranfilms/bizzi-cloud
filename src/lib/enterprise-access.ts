/**
 * Canonical enterprise authorization (server-side).
 * Seat document organization_seats/{orgId}_{uid} is the source of truth for membership and role.
 * Profile organization_id / organization_role are convenience; never grant access on profile alone.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import type { OrganizationRole } from "@/types/enterprise";
import { NextResponse } from "next/server";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";

export interface EnterpriseAccessResolution {
  orgId: string;
  seatExists: boolean;
  seatStatus: string | undefined;
  seatRole: OrganizationRole | undefined;
  isActiveSeat: boolean;
  isAdmin: boolean;
  profileOrgId: string | undefined;
  profileOrgRole: OrganizationRole | undefined;
  profileMatchesOrg: boolean;
  profileRoleMatchesSeat: boolean;
  canAccessEnterprise: boolean;
  denialReason: string | null;
}

function seatRoleFromData(
  role: unknown
): OrganizationRole | undefined {
  return role === "admin" || role === "member" ? role : undefined;
}

/**
 * Resolve access for a specific organization. Always load seat truth for orgId + uid.
 */
export async function resolveEnterpriseAccess(
  uid: string,
  orgId: string,
  db: Firestore = getAdminFirestore()
): Promise<EnterpriseAccessResolution> {
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const p = profileSnap.data();
  const profileOrgId = p?.organization_id as string | undefined;
  const profileOrgRole = seatRoleFromData(p?.organization_role);

  const seatRef = db.collection("organization_seats").doc(`${orgId}_${uid}`);
  const seatSnap = await seatRef.get();
  const seatData = seatSnap.exists ? seatSnap.data() : null;
  const seatStatus = seatData?.status as string | undefined;
  const seatRole = seatRoleFromData(seatData?.role);
  const seatExists = seatSnap.exists;
  const isActiveSeat = seatExists && seatStatus === "active";
  const isAdmin = isActiveSeat && seatRole === "admin";
  const profileMatchesOrg = profileOrgId === orgId;
  const profileRoleMatchesSeat =
    !isActiveSeat ||
    !profileMatchesOrg ||
    profileOrgRole === undefined ||
    profileOrgRole === seatRole;

  const canAccessEnterprise = isActiveSeat;
  let denialReason: string | null = null;
  if (!canAccessEnterprise) {
    if (!seatExists) denialReason = "no_seat";
    else if (seatStatus === "pending") denialReason = "pending_seat";
    else denialReason = "inactive_seat";
  }

  const driftProfileOrg =
    profileOrgId != null &&
    profileOrgId !== orgId &&
    isActiveSeat;
  const driftRole =
    isActiveSeat &&
    profileMatchesOrg &&
    profileOrgRole !== undefined &&
    profileOrgRole !== seatRole;

  if (driftProfileOrg || driftRole) {
    logEnterpriseSecurityEvent("profile_seat_drift", {
      uid,
      orgId,
      profileOrgId: profileOrgId ?? null,
      profileOrgRole: profileOrgRole ?? null,
      seatStatus: seatStatus ?? null,
      seatRole: seatRole ?? null,
      kind: driftProfileOrg ? "profile_org_mismatch" : "profile_role_mismatch",
    });
  }

  if (!isActiveSeat && profileMatchesOrg && profileOrgId === orgId) {
    logEnterpriseSecurityEvent("profile_seat_drift", {
      uid,
      orgId,
      profileOrgId: profileOrgId ?? null,
      seatStatus: seatStatus ?? null,
      kind: "profile_says_member_seat_inactive",
    });
  }

  return {
    orgId,
    seatExists,
    seatStatus,
    seatRole,
    isActiveSeat,
    isAdmin,
    profileOrgId,
    profileOrgRole,
    profileMatchesOrg,
    profileRoleMatchesSeat,
    canAccessEnterprise,
    denialReason,
  };
}

export async function requireUidFromRequest(
  request: Request
): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export async function requireEnterpriseMember(
  request: Request,
  orgId: string,
  route = "unknown"
): Promise<{ uid: string; access: EnterpriseAccessResolution } | NextResponse> {
  const auth = await requireUidFromRequest(request);
  if (auth instanceof NextResponse) return auth;
  const access = await resolveEnterpriseAccess(auth.uid, orgId);
  if (!access.canAccessEnterprise) {
    logEnterpriseSecurityEvent("enterprise_access_denied", {
      uid: auth.uid,
      orgId,
      route,
      denialReason: access.denialReason,
    });
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }
  return { uid: auth.uid, access };
}

export async function requireEnterpriseAdmin(
  request: Request,
  orgId: string,
  route = "unknown"
): Promise<{ uid: string; access: EnterpriseAccessResolution } | NextResponse> {
  const auth = await requireUidFromRequest(request);
  if (auth instanceof NextResponse) return auth;
  const access = await resolveEnterpriseAccess(auth.uid, orgId);
  if (!access.isAdmin) {
    logEnterpriseSecurityEvent("enterprise_admin_denied", {
      uid: auth.uid,
      orgId,
      route,
      isActiveSeat: access.isActiveSeat,
      seatRole: access.seatRole ?? null,
    });
    return NextResponse.json(
      { error: "Only organization admins can perform this action" },
      { status: 403 }
    );
  }
  return { uid: auth.uid, access };
}
