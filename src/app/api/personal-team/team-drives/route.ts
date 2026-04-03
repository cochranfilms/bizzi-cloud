/**
 * GET /api/personal-team/team-drives?owner_uid=
 * Lists the team owner's personal linked_drives (non-enterprise) for the workspace switcher /team/[owner] UI.
 * Uses Admin SDK so seat members are not blocked by client Firestore query evaluation.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { personalTeamSeatDocId } from "@/lib/personal-team-constants";
import { isTeamContainerDriveDoc } from "@/lib/backup-scope";

const ACTIVE_SEAT = new Set(["active", "cold_storage"]);

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

  if (ownerUid !== uid) {
    const db = getAdminFirestore();
    const seatId = personalTeamSeatDocId(ownerUid, uid);
    const seatSnap = await db.collection("personal_team_seats").doc(seatId).get();
    const st = (seatSnap.data()?.status as string) ?? "";
    if (!seatSnap.exists || !ACTIVE_SEAT.has(st)) {
      return NextResponse.json({ error: "Not a member of this team" }, { status: 403 });
    }
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection("linked_drives")
    .where("userId", "==", ownerUid)
    .orderBy("createdAt", "desc")
    .get();

  const drives: Record<string, unknown>[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.deleted_at) continue;
    if (data.organization_id) continue;
    if (!isTeamContainerDriveDoc(data as Record<string, unknown>, ownerUid)) continue;
    let name = (data.name as string) ?? "Folder";
    if (name === "Uploads") name = "Storage";
    drives.push({
      id: d.id,
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
      folder_model_version:
        typeof data.folder_model_version === "number" ? data.folder_model_version : null,
      supports_nested_folders: data.supports_nested_folders === true ? true : null,
    });
  }

  return NextResponse.json({ drives });
}
