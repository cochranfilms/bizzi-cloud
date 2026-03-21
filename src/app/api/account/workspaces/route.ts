/**
 * GET /api/account/workspaces
 * Returns personal workspace and organization workspaces with status for workspace switcher.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import type { PersonalStatus } from "@/types/profile";
import { NextResponse } from "next/server";

function badgeFromStatus(
  storageLifecycle: string | undefined,
  billingStatus: string | undefined,
  personalStatus?: PersonalStatus
): string {
  if (personalStatus === "scheduled_delete" || personalStatus === "recoverable") {
    return "Scheduled for Deletion";
  }
  if (personalStatus === "purged") return "Purged";
  const status = storageLifecycle ?? "active";
  if (status === "cold_storage" || status === "scheduled_delete") return "Recovery Storage";
  if (status === "grace_period") return "Past Due";
  if (billingStatus === "past_due") return "Past Due";
  return "Active";
}

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

  const personalStatus = (profileData?.personal_status as PersonalStatus | undefined) ?? "active";
  const personalStorageLifecycle =
    (profileData?.storage_lifecycle_status as string | undefined) ?? "active";
  const personalBillingStatus = (profileData?.billing_status as string | undefined) ?? "active";

  const personal =
    personalStatus === "purged"
      ? null
      : {
          id: "personal",
          name: "Personal Workspace",
          status: badgeFromStatus(personalStorageLifecycle, personalBillingStatus, personalStatus),
          storageLifecycle: personalStorageLifecycle,
        };

  const activeSeatsSnap = await db
    .collection("organization_seats")
    .where("user_id", "==", uid)
    .where("status", "==", "active")
    .get();

  const organizations: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    storageLifecycle: string;
  }> = [];

  for (const seatDoc of activeSeatsSnap.docs) {
    const seatData = seatDoc.data();
    const orgId = seatData.organization_id as string;
    const role = (seatData.role as string) ?? "member";
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    const orgStorageLifecycle =
      (orgData?.storage_lifecycle_status as string | undefined) ?? "active";
    const orgBillingStatus = (orgData?.billing_status as string | undefined) ?? "active";
    organizations.push({
      id: orgId,
      name: (orgData?.name as string) ?? "Organization",
      role,
      status: badgeFromStatus(orgStorageLifecycle, orgBillingStatus),
      storageLifecycle: orgStorageLifecycle,
    });
  }

  return NextResponse.json({
    personal,
    organizations,
  });
}
