/**
 * POST /api/mount/rename
 * Renames a file or folder in the mounted drive by updating backup_files.relative_path.
 * Used by WebDAV MOVE for renames in Finder/NLE.
 */
import { logActivityEvent } from "@/lib/activity-log";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    drive_id: driveId,
    old_path: oldPath,
    new_path: newPath,
    user_id: userIdFromBody,
  } = body;

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  if (
    !driveId ||
    typeof oldPath !== "string" ||
    !oldPath ||
    typeof newPath !== "string" ||
    !newPath
  ) {
    return NextResponse.json(
      { error: "drive_id, old_path, and new_path are required" },
      { status: 400 }
    );
  }

  const safeOld = oldPath.replace(/^\/+/, "").replace(/\.\./g, "");
  const safeNew = newPath.replace(/^\/+/, "").replace(/\.\./g, "");

  const db = getAdminFirestore();

  // Resolve slug (Storage, RAW, Gallery Media) to drive IDs
  let driveIds: string[] = [driveId];
  if (["Storage", "RAW", "Gallery Media"].includes(driveId)) {
    const [byUserId, byUserIdSnake] = await Promise.all([
      db.collection("linked_drives").where("userId", "==", uid).get(),
      db.collection("linked_drives").where("user_id", "==", uid).get(),
    ]);
    const slugToIds = new Map<string, string[]>();
    const addToSlug = (slug: string, id: string) => {
      const arr = slugToIds.get(slug) ?? [];
      if (!arr.includes(id)) arr.push(id);
      slugToIds.set(slug, arr);
    };
    for (const snap of [byUserId, byUserIdSnake]) {
      for (const d of snap.docs) {
        if (d.data().deleted_at) continue;
        const name = d.data().name ?? "Drive";
        const isCreatorRaw = d.data().is_creator_raw === true;
        if (name === "Storage" || name === "Uploads") addToSlug("Storage", d.id);
        else if (isCreatorRaw) addToSlug("RAW", d.id);
        else if (name === "Gallery Media") addToSlug("Gallery Media", d.id);
      }
    }
    driveIds = slugToIds.get(driveId) ?? [];
  }

  // Find file(s) by relative_path in any of the resolved drives
  // Support both file rename (exact match) and folder rename (prefix match)
  const oldPrefix = `${safeOld}/`;
  let updated = 0;

  for (const did of driveIds) {
    const snap = await db
      .collection("backup_files")
      .where("linked_drive_id", "==", did)
      .where("userId", "==", uid)
      .where("deleted_at", "==", null)
      .get();

    for (const d of snap.docs) {
      const rel = (d.data().relative_path as string) ?? "";
      const newRel =
        rel === safeOld
          ? safeNew
          : rel.startsWith(oldPrefix)
            ? `${safeNew}/${rel.slice(oldPrefix.length)}`
            : null;
      if (newRel !== null) {
        await d.ref.update({ relative_path: newRel });
        updated++;
      }
    }
  }

  if (updated === 0) {
    return NextResponse.json({ error: "File or folder not found" }, { status: 404 });
  }

  const targetName = safeOld.split("/").pop() ?? safeOld;
  logActivityEvent({
    event_type: updated === 1 ? "file_renamed" : "folder_renamed",
    actor_user_id: uid,
    scope_type: "personal_account",
    linked_drive_id: driveIds[0] ?? driveId,
    target_type: updated === 1 ? "file" : "folder",
    target_name: targetName,
    old_path: safeOld,
    new_path: safeNew,
    metadata: { updated_count: updated },
  }).catch(() => {});

  return NextResponse.json({ ok: true, updated });
}
