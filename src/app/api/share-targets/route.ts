/**
 * GET /api/share-targets?q=
 * Personal teams + org workspaces the user already belongs to, plus platform-wide search (when q is long enough).
 */
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SEATS_COLLECTION, PERSONAL_TEAM_SETTINGS_COLLECTION } from "@/lib/personal-team-constants";
import { userCanAccessWorkspace } from "@/lib/workspace-access";
import { getOrgWideShareTargetWorkspaceId } from "@/lib/org-pillar-drives";
import {
  ensurePersonalTeamRecord,
  getOwnedTeam,
  seatStatusAllowsEnter,
} from "@/lib/personal-team-auth";
import { PERSONAL_TEAM_SEAT_ACCESS_LABELS, type PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Firestore } from "firebase-admin/firestore";

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

/** Prefix search on org display name (case variants). */
async function searchOrganizationsByNamePrefix(
  db: Firestore,
  qLower: string
): Promise<Array<{ orgId: string; name: string }>> {
  const out: Array<{ orgId: string; name: string }> = [];
  const seen = new Set<string>();
  const variants = [
    ...new Set([
      qLower,
      qLower.length > 0 ? qLower.charAt(0).toUpperCase() + qLower.slice(1) : qLower,
    ]),
  ].filter(Boolean);
  for (const v of variants) {
    try {
      const snap = await db
        .collection("organizations")
        .orderBy("name")
        .startAt(v)
        .endAt(`${v}\uf8ff`)
        .limit(15)
        .get();
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        const name = ((d.data()?.name as string) ?? "").trim() || "Organization";
        if (!name.toLowerCase().includes(qLower)) continue;
        seen.add(d.id);
        out.push({ orgId: d.id, name });
      }
    } catch {
      /* missing index / empty */
    }
  }
  return out;
}

/** Prefix search on custom team_name (teams with named settings rows). */
async function searchPersonalTeamsByNamePrefix(
  db: Firestore,
  qLower: string
): Promise<Array<{ ownerUid: string; teamName: string }>> {
  const out: Array<{ ownerUid: string; teamName: string }> = [];
  const seen = new Set<string>();
  const variants = [
    ...new Set([
      qLower,
      qLower.length > 0 ? qLower.charAt(0).toUpperCase() + qLower.slice(1) : qLower,
    ]),
  ].filter(Boolean);
  for (const v of variants) {
    try {
      const snap = await db
        .collection(PERSONAL_TEAM_SETTINGS_COLLECTION)
        .orderBy("team_name")
        .startAt(v)
        .endAt(`${v}\uf8ff`)
        .limit(15)
        .get();
      for (const d of snap.docs) {
        const teamName = ((d.data()?.team_name as string) ?? "").trim();
        if (!teamName || !teamName.toLowerCase().includes(qLower)) continue;
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        out.push({ ownerUid: d.id, teamName });
      }
    } catch {
      /* missing field / index */
    }
  }
  return out;
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
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data() ?? {};
  await ensurePersonalTeamRecord(db, uid, profileData);
  const ownedTeam = await getOwnedTeam(db, uid);

  type TargetRow = {
    kind: "personal_team" | "enterprise_workspace";
    id: string;
    label: string;
    subtitle: string;
    hrefHint: string;
  };

  const targets: TargetRow[] = [];
  const teamSeen = new Set<string>();

  if (ownedTeam) {
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
    if (!seatStatusAllowsEnter(st)) continue;
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

  const targetKeys = new Set(targets.map((t) => `${t.kind}:${t.id}`));

  for (const orgId of orgIds) {
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgName = orgSnap.exists ? ((orgSnap.data()?.name as string) ?? "Organization") : "Organization";

    const shareWsId = await getOrgWideShareTargetWorkspaceId(orgId);
    if (!shareWsId) continue;
    if (!(await userCanAccessWorkspace(uid, shareWsId))) continue;

    targets.push({
      kind: "enterprise_workspace",
      id: shareWsId,
      label: orgName,
      subtitle: "Org · All members",
      hrefHint: "/enterprise/shared",
    });
    targetKeys.add(`enterprise_workspace:${shareWsId}`);
  }

  if (qRaw.length >= 2) {
    const orgHits = await searchOrganizationsByNamePrefix(db, qRaw);
    for (const { orgId, name } of orgHits) {
      const shareWsId = await getOrgWideShareTargetWorkspaceId(orgId);
      if (!shareWsId) continue;
      const k = `enterprise_workspace:${shareWsId}`;
      if (targetKeys.has(k)) continue;
      targetKeys.add(k);
      targets.push({
        kind: "enterprise_workspace",
        id: shareWsId,
        label: name,
        subtitle: "Organization · Search",
        hrefHint: "/enterprise/shared",
      });
    }

    const teamHits = await searchPersonalTeamsByNamePrefix(db, qRaw);
    for (const { ownerUid, teamName } of teamHits) {
      const k = `personal_team:${ownerUid}`;
      if (targetKeys.has(k)) continue;
      targetKeys.add(k);
      targets.push({
        kind: "personal_team",
        id: ownerUid,
        label: teamName,
        subtitle: "Personal team · Search",
        hrefHint: `/team/${ownerUid}/shared`,
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
