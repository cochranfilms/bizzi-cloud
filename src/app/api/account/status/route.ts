/**
 * GET /api/account/status
 * Returns personal workspace lifecycle status and enterprise access for post-login UX.
 * Used to determine if user should be redirected to /account/personal-deleted interstitial.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { userHasActiveOrgAdminSeat } from "@/lib/enterprise-access";
import type { PersonalStatus } from "@/types/profile";
import { parseWorkspaceOnboardingFromProfile } from "@/lib/workspace-onboarding";
import { NextResponse } from "next/server";

const RECOVERABLE_STATUSES: PersonalStatus[] = ["scheduled_delete", "recoverable"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();

  if (!profileSnap.exists || !profileData) {
    return NextResponse.json({
      personal_status: "active",
      personal_restore_available_until: null,
      enterprise_orgs: [],
      redirect_to_interstitial: false,
      workspace_onboarding_pending: false,
      workspace_onboarding_status: null,
      workspace_onboarding_version: null,
    });
  }

  const personalStatus =
    (profileData.personal_status as PersonalStatus | undefined) ?? "active";
  const restoreUntil = profileData.personal_restore_available_until?.toDate?.();

  const activeSeatsSnap = await db
    .collection("organization_seats")
    .where("user_id", "==", uid)
    .where("status", "==", "active")
    .get();

  const enterprise_orgs: { id: string; name: string }[] = [];
  for (const seatDoc of activeSeatsSnap.docs) {
    const orgId = seatDoc.data().organization_id as string;
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    enterprise_orgs.push({
      id: orgId,
      name: (orgData?.name as string) ?? "Organization",
    });
  }

  const now = new Date();
  const restoreStillValid =
    restoreUntil && restoreUntil > now && RECOVERABLE_STATUSES.includes(personalStatus);
  const redirect_to_interstitial =
    !!restoreStillValid && enterprise_orgs.length > 0;

  /** Active org admin on any enterprise org (organization_seats), not `organizations.created_by`. */
  const owns_org = await userHasActiveOrgAdminSeat(uid, db);

  const wo = parseWorkspaceOnboardingFromProfile(profileData as Record<string, unknown>);
  const workspace_onboarding_pending = wo.status === "pending";

  return NextResponse.json({
    personal_status: personalStatus,
    personal_restore_available_until: restoreUntil
      ? restoreUntil.toISOString()
      : null,
    enterprise_orgs,
    redirect_to_interstitial,
    owns_org,
    can_delete_identity: !owns_org,
    workspace_onboarding_pending,
    workspace_onboarding_status: wo.status,
    workspace_onboarding_version: wo.version,
  });
}
