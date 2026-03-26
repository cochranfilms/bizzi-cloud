/**
 * GET/PATCH /api/personal-team/settings?owner_uid=
 * Team-scoped settings (Admin writes). Owner can update; seats can read.
 */
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import {
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { ENTERPRISE_THEMES } from "@/lib/enterprise-themes";
const ACTIVE_SEAT = new Set(["active", "cold_storage"]);
const THEME_IDS: Set<string> = new Set(ENTERPRISE_THEMES.map((t) => t.id));

async function assertCanReadTeamSettings(
  db: Firestore,
  uid: string,
  ownerUid: string
): Promise<boolean> {
  if (uid === ownerUid) return true;
  const seatId = personalTeamSeatDocId(ownerUid, uid);
  const seatSnap = await db.collection("personal_team_seats").doc(seatId).get();
  const st = (seatSnap.data()?.status as string) ?? "";
  return seatSnap.exists && ACTIVE_SEAT.has(st);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ownerUid = (url.searchParams.get("owner_uid") ?? "").trim();
  if (!ownerUid) {
    return NextResponse.json({ error: "owner_uid required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!(await assertCanReadTeamSettings(db, uid, ownerUid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snap = await db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(ownerUid).get();
  const data = snap.data() ?? {};
  const updatedAt = data.updated_at;
  return NextResponse.json({
    team_owner_id: ownerUid,
    team_name: (data.team_name as string) ?? null,
    logo_url: (data.logo_url as string) ?? null,
    theme: (data.theme as string) ?? "bizzi",
    updated_at:
      updatedAt && typeof (updatedAt as { toDate?: () => Date }).toDate === "function"
        ? (updatedAt as { toDate: () => Date }).toDate().toISOString()
        : null,
    is_owner: uid === ownerUid,
  });
}

export async function PATCH(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ownerUid = (url.searchParams.get("owner_uid") ?? "").trim();
  if (!ownerUid) {
    return NextResponse.json({ error: "owner_uid required" }, { status: 400 });
  }

  if (uid !== ownerUid) {
    return NextResponse.json({ error: "Only the team owner can update settings" }, { status: 403 });
  }

  let body: { team_name?: unknown; theme?: unknown; logo_url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(ownerUid);
  const patch: Record<string, unknown> = {
    team_owner_id: ownerUid,
    updated_at: FieldValue.serverTimestamp(),
  };

  if ("team_name" in body) {
    const raw = typeof body.team_name === "string" ? body.team_name.trim() : "";
    if (raw.length > 120) {
      return NextResponse.json({ error: "Team name is too long" }, { status: 400 });
    }
    patch.team_name = raw.length ? raw : null;
  }

  if ("theme" in body) {
    const t = typeof body.theme === "string" ? body.theme.trim() : "";
    if (!THEME_IDS.has(t)) {
      return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
    }
    patch.theme = t;
  }

  if ("logo_url" in body) {
    const v = body.logo_url;
    if (v === null) {
      patch.logo_url = null;
    } else if (typeof v === "string" && v.trim().length > 0 && v.length < 2048) {
      patch.logo_url = v.trim();
    } else if (typeof v === "string" && v.trim().length === 0) {
      patch.logo_url = null;
    } else {
      return NextResponse.json({ error: "Invalid logo_url" }, { status: 400 });
    }
  }

  const before = await ref.get();
  const payload: Record<string, unknown> = { ...patch };
  if (!before.exists) {
    payload.created_at = FieldValue.serverTimestamp();
  }
  await ref.set(payload, { merge: true });

  const snap = await ref.get();
  const data = snap.data() ?? {};
  return NextResponse.json({
    team_owner_id: ownerUid,
    team_name: (data.team_name as string) ?? null,
    logo_url: (data.logo_url as string) ?? null,
    theme: (data.theme as string) ?? "bizzi",
  });
}
