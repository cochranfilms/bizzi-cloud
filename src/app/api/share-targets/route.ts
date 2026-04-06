/**
 * GET /api/share-targets?q=
 * Teams and orgs you belong to, plus a platform directory (bounded) so the share picker
 * can populate without typing. Optional `q` filters the combined list (substring match).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  PERSONAL_TEAMS_COLLECTION,
} from "@/lib/personal-team-constants";
import { userCanAccessWorkspace } from "@/lib/workspace-access";
import { getOrgWideShareTargetWorkspaceIdMap } from "@/lib/org-pillar-drives";
import {
  ensurePersonalTeamRecord,
  ownerHasPersonalTeamShell,
  seatStatusAllowsEnter,
} from "@/lib/personal-team-auth";
import { PERSONAL_TEAM_SEAT_ACCESS_LABELS, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import { checkRateLimit } from "@/lib/rate-limit";
import { FieldPath, type Firestore } from "firebase-admin/firestore";

const SHARE_TARGETS_DIRECTORY_ORG_LIMIT = 500;
const SHARE_TARGETS_DIRECTORY_TEAM_LIMIT = 400;

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

async function personalTeamShareTargetDisplay(
  db: Firestore,
  ownerUid: string,
  profileFallback: string
): Promise<{ label: string; logo_url: string | null }> {
  const snap = await db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(ownerUid).get();
  const data = snap.data();
  const custom = (data?.team_name as string | undefined)?.trim();
  const logoRaw = (data?.logo_url as string | undefined)?.trim();
  return {
    label: custom || profileFallback,
    logo_url: logoRaw && logoRaw.length > 0 ? logoRaw : null,
  };
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

  const rl = checkRateLimit(`share-targets:${uid}`, 90, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const url = new URL(request.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const db = getAdminFirestore();
  const orgShareWsByOrgId = await getOrgWideShareTargetWorkspaceIdMap();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data() ?? {};
  await ensurePersonalTeamRecord(db, uid, profileData);
  type TargetRow = {
    kind: "personal_team" | "enterprise_workspace";
    id: string;
    label: string;
    subtitle: string;
    hrefHint: string;
    /** Team/org profile image for picker (personal team settings or organization logo). */
    logo_url: string | null;
  };

  const targets: TargetRow[] = [];
  const teamSeen = new Set<string>();

  if (await ownerHasPersonalTeamShell(db, uid)) {
    const ownerName = await profileDisplayName(db, uid);
    const fallback = ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
    const { label: name, logo_url: ownLogo } = await personalTeamShareTargetDisplay(db, uid, fallback);
    teamSeen.add(uid);
    targets.push({
      kind: "personal_team",
      id: uid,
      label: name,
      subtitle: "Personal team · You own",
      hrefHint: `/team/${uid}/shared`,
      logo_url: ownLogo,
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
    if (!seatStatusAllowsEnter(st)) continue;
    teamSeen.add(ownerId);
    const ownerName = await profileDisplayName(db, ownerId);
    const fallback =
      ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
    const { label: name, logo_url: seatLogo } = await personalTeamShareTargetDisplay(db, ownerId, fallback);
    const level = (sd.seat_access_level as PersonalTeamSeatAccess) ?? "none";
    const roleLabel = level === "none" ? "Member" : PERSONAL_TEAM_SEAT_ACCESS_LABELS[level] ?? "Member";
    targets.push({
      kind: "personal_team",
      id: ownerId,
      label: name,
      subtitle: `Personal team · ${roleLabel}`,
      hrefHint: `/team/${ownerId}/shared`,
      logo_url: seatLogo,
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
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    const orgName = orgSnap.exists ? ((orgData?.name as string) ?? "Organization") : "Organization";
    const orgLogoRaw = (orgData?.logo_url as string | undefined)?.trim();
    const orgLogo = orgLogoRaw && orgLogoRaw.length > 0 ? orgLogoRaw : null;

    const shareWsId = orgShareWsByOrgId.get(orgId) ?? null;
    if (!shareWsId) continue;
    if (!(await userCanAccessWorkspace(uid, shareWsId))) continue;

    targets.push({
      kind: "enterprise_workspace",
      id: shareWsId,
      label: orgName,
      subtitle: "Org · All members",
      hrefHint: "/enterprise/shared",
      logo_url: orgLogo,
    });
  }

  const targetKeys = new Set(targets.map((t) => `${t.kind}:${t.id}`));

  try {
    const orgDirSnap = await db
      .collection("organizations")
      .orderBy("name")
      .limit(SHARE_TARGETS_DIRECTORY_ORG_LIMIT)
      .get();
    for (const d of orgDirSnap.docs) {
      const orgId = d.id;
      const shareWsId = orgShareWsByOrgId.get(orgId) ?? null;
      if (!shareWsId) continue;
      const k = `enterprise_workspace:${shareWsId}`;
      if (targetKeys.has(k)) continue;
      targetKeys.add(k);
      const od = d.data();
      const name = ((od?.name as string) ?? "").trim() || "Organization";
      const dirOrgLogo = (od?.logo_url as string | undefined)?.trim() || null;
      targets.push({
        kind: "enterprise_workspace",
        id: shareWsId,
        label: name,
        subtitle: "Org · All members",
        hrefHint: "/enterprise/shared",
        logo_url: dirOrgLogo && dirOrgLogo.length > 0 ? dirOrgLogo : null,
      });
    }
  } catch {
    /* missing index */
  }

  try {
    /** Lexicographic doc id order so the capped page is deterministic across requests. */
    const teamDirSnap = await db
      .collection(PERSONAL_TEAMS_COLLECTION)
      .orderBy(FieldPath.documentId())
      .limit(SHARE_TARGETS_DIRECTORY_TEAM_LIMIT)
      .get();
    for (const d of teamDirSnap.docs) {
      const ownerUid = d.id;
      if (!ownerUid) continue;
      const k = `personal_team:${ownerUid}`;
      if (targetKeys.has(k)) continue;
      targetKeys.add(k);
      const ownerName = await profileDisplayName(db, ownerUid);
      const fallback =
        ownerName.endsWith("s") ? `${ownerName}' team` : `${ownerName}'s team`;
      const { label, logo_url: dirTeamLogo } = await personalTeamShareTargetDisplay(db, ownerUid, fallback);
      targets.push({
        kind: "personal_team",
        id: ownerUid,
        label,
        subtitle: "Personal team",
        hrefHint: `/team/${ownerUid}/shared`,
        logo_url: dirTeamLogo,
      });
    }
  } catch {
    /* collection unavailable */
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
