/**
 * GET /api/account/status
 * Personal lifecycle + enterprise seat summary for post-login UX.
 * Hot path: active users — avoid org name fetches and duplicate seat queries.
 *
 * Server-Timing header reports phase durations (ms) when supported by the runtime.
 * Set ACCOUNT_STATUS_TIMING_LOG=1 for stdout JSON lines (staging/debug).
 */
import { performance } from "node:perf_hooks";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import type { PersonalStatus } from "@/types/profile";
import { parseWorkspaceOnboardingFromProfile } from "@/lib/workspace-onboarding";
import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";

const RECOVERABLE_STATUSES: PersonalStatus[] = ["scheduled_delete", "recoverable"];

function seatRoleIsAdmin(data: { role?: unknown } | undefined): boolean {
  const r = data?.role;
  return r === "admin";
}

function buildServerTimingHeader(durations: Record<string, number>): string {
  return Object.entries(durations)
    .map(([name, ms]) => `${name};dur=${Math.max(0, Math.round(ms * 100) / 100)}`)
    .join(", ");
}

async function fetchEnterpriseOrgLabels(
  db: Firestore,
  orgIds: string[]
): Promise<{ id: string; name: string }[]> {
  if (orgIds.length === 0) return [];
  const snaps = await Promise.all(
    orgIds.map((id) => db.collection("organizations").doc(id).get())
  );
  return snaps.map((orgSnap, i) => {
    const orgId = orgIds[i]!;
    const orgData = orgSnap.data();
    return {
      id: orgId,
      name: (orgData?.name as string) ?? "Organization",
    };
  });
}

export async function GET(request: Request) {
  const tRoute = performance.now();
  const timings: Record<string, number> = {};
  const logTiming = process.env.ACCOUNT_STATUS_TIMING_LOG === "1";

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const t0 = performance.now();
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    timings.verify = performance.now() - t0;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();

  const tParallel = performance.now();
  const [profileSnap, activeSeatsSnap] = await Promise.all([
    db.collection("profiles").doc(uid).get(),
    db
      .collection("organization_seats")
      .where("user_id", "==", uid)
      .where("status", "==", "active")
      .get(),
  ]);
  timings.profile_and_seats = performance.now() - tParallel;

  const profileData = profileSnap.data();

  if (!profileSnap.exists || !profileData) {
    timings.total = performance.now() - tRoute;
    if (logTiming) {
      console.info(
        JSON.stringify({ route: "/api/account/status", uid, phase: "no_profile", timings })
      );
    }
    const res = NextResponse.json({
      personal_status: "active",
      personal_restore_available_until: null,
      enterprise_orgs: [],
      redirect_to_interstitial: false,
      workspace_onboarding_pending: false,
      workspace_onboarding_status: null,
      workspace_onboarding_version: null,
    });
    res.headers.set("Server-Timing", buildServerTimingHeader(timings));
    return res;
  }

  const personalStatus =
    (profileData.personal_status as PersonalStatus | undefined) ?? "active";
  const restoreUntil = profileData.personal_restore_available_until?.toDate?.();

  const now = new Date();
  const restoreStillValid =
    !!restoreUntil &&
    restoreUntil > now &&
    RECOVERABLE_STATUSES.includes(personalStatus);

  /** Only identity-recovery interstitial needs org names; skip org doc reads for everyone else. */
  const needsEnterpriseOrgDetails = restoreStillValid;

  const orgIdsSeen = new Set<string>();
  for (const seatDoc of activeSeatsSnap.docs) {
    const orgId = seatDoc.data().organization_id as string | undefined;
    if (orgId) orgIdsSeen.add(orgId);
  }
  const uniqueOrgIds = [...orgIdsSeen];

  const owns_org = activeSeatsSnap.docs.some((d) => seatRoleIsAdmin(d.data()));

  let enterprise_orgs: { id: string; name: string }[] = [];
  let redirect_to_interstitial = false;

  const tOrgs = performance.now();
  if (needsEnterpriseOrgDetails && uniqueOrgIds.length > 0) {
    enterprise_orgs = await fetchEnterpriseOrgLabels(db, uniqueOrgIds);
    redirect_to_interstitial = enterprise_orgs.length > 0;
  } else {
    enterprise_orgs = [];
    redirect_to_interstitial = false;
  }
  timings.org_labels = needsEnterpriseOrgDetails ? performance.now() - tOrgs : 0;

  const wo = parseWorkspaceOnboardingFromProfile(profileData as Record<string, unknown>);
  const workspace_onboarding_pending = wo.status === "pending";

  timings.total = performance.now() - tRoute;
  if (logTiming) {
    console.info(
      JSON.stringify({
        route: "/api/account/status",
        uid,
        phase: "ok",
        needsEnterpriseOrgDetails,
        seatCount: activeSeatsSnap.docs.length,
        timings,
      })
    );
  }

  const res = NextResponse.json({
    personal_status: personalStatus,
    personal_restore_available_until: restoreUntil ? restoreUntil.toISOString() : null,
    enterprise_orgs,
    redirect_to_interstitial,
    owns_org,
    can_delete_identity: !owns_org,
    workspace_onboarding_pending,
    workspace_onboarding_status: wo.status,
    workspace_onboarding_version: wo.version,
  });
  res.headers.set("Server-Timing", buildServerTimingHeader(timings));
  return res;
}
