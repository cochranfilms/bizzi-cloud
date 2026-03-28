/**
 * POST /api/personal-team/create-drive
 * Creates a linked_drives row in the team owner's container (userId + personal_team_owner_id = owner).
 * Required for team seat members: client SDK cannot set userId to the owner on create.
 */
import type { DocumentData } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { personalTeamSeatDocId } from "@/lib/personal-team-constants";
import { ensurePersonalTeamRecord } from "@/lib/personal-team-auth";

const ACTIVE_SEAT = new Set(["active", "cold_storage"]);
const MAX_NAME_LEN = 240;

function mapDriveDoc(
  id: string,
  data: DocumentData,
  ownerUid: string
): Record<string, unknown> {
  let name = (data.name as string) ?? "Folder";
  if (name === "Uploads") name = "Storage";
  return {
    id,
    user_id: data.userId,
    name,
    mount_path: data.mount_path ?? null,
    permission_handle_id: data.permission_handle_id ?? null,
    last_synced_at: data.last_synced_at ?? null,
    created_at:
      data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    organization_id: null,
    creator_section: data.creator_section ?? false,
    is_creator_raw: data.is_creator_raw ?? false,
    personal_team_owner_id: ownerUid,
  };
}

export async function POST(request: Request) {
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

  let body: {
    team_owner_user_id?: string;
    name?: string;
    creator_section?: boolean;
    is_creator_raw?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const teamOwnerUserId = (body.team_owner_user_id ?? "").trim();
  if (!teamOwnerUserId) {
    return NextResponse.json({ error: "team_owner_user_id required" }, { status: 400 });
  }

  const rawName = (body.name ?? "New folder").trim() || "New folder";
  if (rawName.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  const db = getAdminFirestore();

  if (uid === teamOwnerUserId) {
    const ownerProf = await db.collection("profiles").doc(uid).get();
    await ensurePersonalTeamRecord(
      db,
      uid,
      ownerProf.data() as Record<string, unknown> | undefined,
      { allowPlanBootstrap: true }
    );
  }

  if (uid !== teamOwnerUserId) {
    const seatId = personalTeamSeatDocId(teamOwnerUserId, uid);
    const seatSnap = await db.collection("personal_team_seats").doc(seatId).get();
    const st = (seatSnap.data()?.status as string) ?? "";
    if (!seatSnap.exists || !ACTIVE_SEAT.has(st)) {
      return NextResponse.json({ error: "Not a member of this team" }, { status: 403 });
    }
  }

  const permissionPrefix = body.is_creator_raw ? "creator-raw" : "manual";
  const docRef = await db.collection("linked_drives").add({
    userId: teamOwnerUserId,
    name: rawName,
    permission_handle_id: `${permissionPrefix}-${Date.now()}`,
    createdAt: FieldValue.serverTimestamp(),
    organization_id: null,
    personal_team_owner_id: teamOwnerUserId,
    ...(body.creator_section ? { creator_section: true } : {}),
    ...(body.is_creator_raw
      ? { is_creator_raw: true, creator_section: true }
      : {}),
  });

  const created = await docRef.get();
  const data = created.data() ?? {};

  return NextResponse.json({
    drive: mapDriveDoc(docRef.id, data, teamOwnerUserId),
  });
}
