/**
 * GET /api/share-targets?q=&organization_id=
 * Searchable workspace targets the user may share to (personal teams + enterprise workspaces).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SEATS_COLLECTION, PERSONAL_TEAM_SETTINGS_COLLECTION } from "@/lib/personal-team-constants";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-access";
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import { PERSONAL_TEAM_SEAT_ACCESS_LABELS, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import type { WorkspaceType } from "@/types/workspace";
import type { Firestore } from "firebase-admin/firestore";

function scopeLabelForWorkspaceType(t: WorkspaceType): string {
  switch (t) {
    case "org_shared":
      return "Organization";
    case "team":
      return "Team";
    case "project":
      return "Project";
    case "gallery":
      return "Gallery";
    case "private":
      return "Private";
    default:
      return "Workspace";
  }
}

async function profileDisplayName(db: Firestore, uid: string): Promise<string> {
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

async function personalTeamWorkspaceMeta(
  db: Firestore,
  ownerUid: string,
  profileFallback: string
): Promise<string> {
  const snap = await db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(ownerUid).get();
  const data = snap.data();
  const custom = (data?.team_name as string | undefined)?.trim();
  return custom || profileFallback;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const organizationIdParam = (url.searchParams.get("organization_id") ?? "").trim();

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const planId = (profileData?.plan_id as string) ?? "free";
  const seatedOnOtherTeam = !!(profileData?.personal_team_owner_id as string | undefined)?.trim();
  const isTeamOwner = planAllowsPersonalTeamSeats(planId) && !seatedOnOtherTeam;

  type TargetRow = {
    kind: "personal_team" | "enterprise_workspace";
    id: string;
    label: string;
    subtitle: string;
    hrefHint: string;
  };

  const targets: TargetRow[] = [];
  const teamSeen = new Set<string>();

  if (isTeamOwner) {
    const ownerName = await profileDisplayName(db, uid);
    const fallback = ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
    const name = await personalTeamWorkspaceMeta(db, uid, fallback);
    teamSeen.add(uid);
    targets.push({
      kind: "personal_team",
      id: uid,
      label: name,
      subtitle: "Personal team · You own",
      hrefHint: `/team/${uid}/shared`,
    });
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
    teamSeen.add(ownerId);
    const ownerName = await profileDisplayName(db, ownerId);
    const fallback =
      ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
    const name = await personalTeamWorkspaceMeta(db, ownerId, fallback);
    const level = (sd.seat_access_level as PersonalTeamSeatAccess) ?? "none";
    const roleLabel = level === "none" ? "Member" : PERSONAL_TEAM_SEAT_ACCESS_LABELS[level] ?? "Member";
    targets.push({
      kind: "personal_team",
      id: ownerId,
      label: name,
      subtitle: `Personal team · ${roleLabel}`,
      hrefHint: `/team/${ownerId}/shared`,
    });
  }

  const activeOrgSeats = await db
    .collection("organization_seats")
    .where("user_id", "==", uid)
    .where("status", "==", "active")
    .get();

  const orgIds = new Set<string>();
  for (const d of activeOrgSeats.docs) {
    const oid = d.data().organization_id as string;
    if (oid) orgIds.add(oid);
  }

  for (const orgId of orgIds) {
    if (organizationIdParam && orgId !== organizationIdParam) continue;
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgName = orgSnap.exists ? ((orgSnap.data()?.name as string) ?? "Organization") : "Organization";

    const workspaceIds = await getAccessibleWorkspaceIds(uid, orgId);
    for (const wsId of workspaceIds) {
      const wsSnap = await db.collection("workspaces").doc(wsId).get();
      if (!wsSnap.exists) continue;
      const ws = wsSnap.data()!;
      const wsName = (ws.name as string) ?? "Workspace";
      const wsType = (ws.workspace_type as WorkspaceType) ?? "private";
      const scope = scopeLabelForWorkspaceType(wsType);
      targets.push({
        kind: "enterprise_workspace",
        id: wsId,
        label: wsName,
        subtitle: `${orgName} · ${scope}`,
        hrefHint: "/enterprise/shared",
      });
    }
  }

  const filtered =
    qRaw.length === 0
      ? targets
      : targets.filter(
          (t) =>
            t.label.toLowerCase().includes(qRaw) ||
            t.subtitle.toLowerCase().includes(qRaw) ||
            t.id.toLowerCase().includes(qRaw)
        );

  filtered.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

  return NextResponse.json({ targets: filtered });
}
