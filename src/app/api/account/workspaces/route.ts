/**
 * GET /api/account/workspaces
 * Returns personal workspace, personal teams, and organization workspaces with status for workspace switcher.
 * Owned personal team rows come from `personal_teams` only (not plan inference).
 *
 * Rollout / degraded load: `workspace_load_issues` lists non-PII codes when a row fails; the response
 * still includes `personal`, `organizations`, and every team row that loaded successfully.
 * `workspace_rollout` is non-null when load was partial or identity warnings exist (safe user message only).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { ENTERPRISE_THEMES } from "@/lib/enterprise-themes";
import type { PersonalStatus } from "@/types/profile";
import type { EnterpriseThemeId } from "@/types/enterprise";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team";
import { PERSONAL_TEAM_SETTINGS_COLLECTION } from "@/lib/personal-team-constants";
import {
  ensurePersonalTeamRecord,
  ownerPersonalTeamWorkspaceActivated,
  resolvePersonalTeamIdentityConflicts,
  seatStatusShowsInSwitcher,
} from "@/lib/personal-team-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { PERSONAL_TEAM_SEAT_ACCESS_LABELS, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";

function normalizeThemeId(raw: unknown): EnterpriseThemeId {
  const t = typeof raw === "string" ? raw.trim() : "";
  return ENTERPRISE_THEMES.some((x) => x.id === t) ? (t as EnterpriseThemeId) : "bizzi";
}

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

async function personalTeamWorkspaceMeta(
  db: import("firebase-admin/firestore").Firestore,
  ownerUid: string,
  profileFallback: string
): Promise<{ name: string; theme: EnterpriseThemeId }> {
  const snap = await db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(ownerUid).get();
  const data = snap.data();
  const custom = (data?.team_name as string | undefined)?.trim();
  const name = custom || profileFallback;
  const theme = normalizeThemeId(data?.theme);
  return { name, theme };
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
  const pdata = profileData ?? {};

  await ensurePersonalTeamRecord(db, uid, pdata);

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
    theme: EnterpriseThemeId;
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
      theme: normalizeThemeId(orgData?.theme),
    });
  }

  const personalTeams: Array<{
    id: string;
    ownerUserId: string;
    name: string;
    role: string;
    status: string;
    theme: EnterpriseThemeId;
    membershipKind: "owned" | "member";
  }> = [];
  const teamSeen = new Set<string>();
  /** Deploy / rollout: non-PII codes only; keeps switcher usable if one row fails. */
  const workspaceLoadIssues: Array<{ scope: string; code: string }> = [];

  try {
    const ownerTeamInSwitcher = await ownerPersonalTeamWorkspaceActivated(db, uid);
    if (ownerTeamInSwitcher) {
      try {
        const ownerName = await profileDisplayName(db, uid);
        const label = ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
        const { name, theme } = await personalTeamWorkspaceMeta(db, uid, label);
        personalTeams.push({
          id: `team_${uid}`,
          ownerUserId: uid,
          name,
          role: "Admin",
          status: badgeFromStatus(personalStorageLifecycle, personalBillingStatus, personalStatus),
          theme,
          membershipKind: "owned",
        });
        teamSeen.add(uid);
      } catch (err) {
        console.error("[GET /api/account/workspaces] owned personal team row skipped", uid, err);
        workspaceLoadIssues.push({ scope: "owned_personal_team", code: "row_load_failed" });
      }
    }
  } catch (err) {
    console.error("[GET /api/account/workspaces] owned personal team switcher check failed", uid, err);
    workspaceLoadIssues.push({ scope: "owned_personal_team", code: "row_load_failed" });
  }

  let memberOrSeatDocs: import("firebase-admin/firestore").QueryDocumentSnapshot[] = [];
  try {
    const snap = await db
      .collection(PERSONAL_TEAM_SEATS_COLLECTION)
      .where("member_user_id", "==", uid)
      .get();
    memberOrSeatDocs = snap.docs;
  } catch (err) {
    console.error("[GET /api/account/workspaces] member seats query failed", uid, err);
    workspaceLoadIssues.push({ scope: "member_personal_team_list", code: "query_failed" });
  }

  for (const seatDoc of memberOrSeatDocs) {
    try {
      const sd = seatDoc.data();
      const ownerId = sd.team_owner_user_id as string;
      const st = (sd.status as string) ?? "active";
      if (!ownerId || ownerId === uid || teamSeen.has(ownerId)) continue;
      if (!seatStatusShowsInSwitcher(st)) continue;
      const ownerName = await profileDisplayName(db, ownerId);
      const fallback =
        ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
      const { name, theme } = await personalTeamWorkspaceMeta(db, ownerId, fallback);
      const level = (sd.seat_access_level as PersonalTeamSeatAccess) ?? "none";
      const roleLabel = level === "none" ? "Member" : PERSONAL_TEAM_SEAT_ACCESS_LABELS[level] ?? "Member";
      personalTeams.push({
        id: `team_${ownerId}`,
        ownerUserId: ownerId,
        name,
        role: roleLabel,
        status: st === "cold_storage" ? "Recovery Storage" : "Active",
        theme,
        membershipKind: "member",
      });
      teamSeen.add(ownerId);
    } catch (err) {
      console.error("[GET /api/account/workspaces] member team row skipped", uid, err);
      workspaceLoadIssues.push({ scope: "member_personal_team_row", code: "row_load_failed" });
    }
  }

  const identity = await resolvePersonalTeamIdentityConflicts(db, uid, pdata);
  if (identity.warnings.length > 0) {
    await writeAuditLog({
      action: "personal_team_identity_conflict",
      uid,
      metadata: {
        route: "GET /api/account/workspaces",
        warnings: identity.warnings,
      },
    });
  }

  const rolloutDegraded =
    workspaceLoadIssues.length > 0 || identity.warnings.length > 0;

  return NextResponse.json({
    personal,
    organizations,
    personalTeams,
    identity_warnings: identity.warnings,
    workspace_load_issues: workspaceLoadIssues,
    workspace_rollout: rolloutDegraded
      ? {
          partial_team_list: workspaceLoadIssues.length > 0,
          identity_attention_needed: identity.warnings.length > 0,
          support_message:
            "Something may be out of sync. Your personal workspace should still work. If a team is missing or wrong, contact support and mention workspace switcher load.",
        }
      : null,
  });
}
