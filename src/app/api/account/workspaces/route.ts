/**
 * GET /api/account/workspaces
 * Returns personal workspace, personal teams, and organization workspaces with status for workspace switcher.
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import type { PersonalStatus } from "@/types/profile";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team";
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import { PERSONAL_TEAM_SEAT_ACCESS_LABELS, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";

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

async function profileDisplayName(
  db: import("firebase-admin/firestore").Firestore,
  uid: string
): Promise<string> {
  const snap = await db.collection("profiles").doc(uid).get();
  const d = snap.data();
  const name =
    (d?.display_name as string)?.trim() ||
    (d?.displayName as string)?.trim() ||
    (d?.name as string)?.trim() ||
    "";
  if (name) return name;
  try {
    const rec = await getAdminAuth().getUser(uid);
    return (rec.email?.split("@")[0] ?? "") || "Team";
  } catch {
    return "Team";
  }
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

  const personalTeams: Array<{
    id: string;
    ownerUserId: string;
    name: string;
    role: string;
    status: string;
  }> = [];
  const teamSeen = new Set<string>();

  const planId = (profileData?.plan_id as string) ?? "free";
  /** Only show “your team” as admin when you are not a seat on someone else’s team. */
  const seatedOnOtherTeam = !!(profileData?.personal_team_owner_id as string | undefined)?.trim();
  const isTeamOwner = planAllowsPersonalTeamSeats(planId) && !seatedOnOtherTeam;

  if (isTeamOwner) {
    const ownerName = await profileDisplayName(db, uid);
    const label = ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
    personalTeams.push({
      id: `team_${uid}`,
      ownerUserId: uid,
      name: label,
      role: "Admin",
      status: badgeFromStatus(personalStorageLifecycle, personalBillingStatus, personalStatus),
    });
    teamSeen.add(uid);
  }

  const memberSeatsSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("member_user_id", "==", uid)
    .get();

  for (const seatDoc of memberSeatsSnap.docs) {
    const sd = seatDoc.data();
    const ownerId = sd.team_owner_user_id as string;
    const st = (sd.status as string) ?? "active";
    if (!ownerId || ownerId === uid || teamSeen.has(ownerId)) continue;
    if (st !== "active" && st !== "cold_storage") continue;
    const ownerName = await profileDisplayName(db, ownerId);
    const level = (sd.seat_access_level as PersonalTeamSeatAccess) ?? "none";
    const roleLabel = level === "none" ? "Member" : PERSONAL_TEAM_SEAT_ACCESS_LABELS[level] ?? "Member";
    personalTeams.push({
      id: `team_${ownerId}`,
      ownerUserId: ownerId,
      name: ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`,
      role: roleLabel,
      status: st === "cold_storage" ? "Recovery Storage" : "Active",
    });
    teamSeen.add(ownerId);
  }

  return NextResponse.json({
    personal,
    organizations,
    personalTeams,
  });
}
