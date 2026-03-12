/**
 * POST /api/mount/delete
 * Soft-deletes a file or folder (sets deleted_at) for items in the mounted drive.
 * Used by WebDAV DELETE when user deletes from Finder.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { drive_id: driveId, path: relativePath, user_id: userIdFromBody } = body;

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

  if (!driveId || typeof relativePath !== "string" || !relativePath) {
    return NextResponse.json(
      { error: "drive_id and path are required" },
      { status: 400 }
    );
  }

  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");

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

  // Delete file (exact match) or folder (prefix match)
  const pathPrefix = `${safePath}/`;
  let deleted = 0;

  for (const did of driveIds) {
    const [snapUserId, snapUserIdSnake] = await Promise.all([
      db
        .collection("backup_files")
        .where("linked_drive_id", "==", did)
        .where("userId", "==", uid)
        .where("deleted_at", "==", null)
        .get(),
      db
        .collection("backup_files")
        .where("linked_drive_id", "==", did)
        .where("user_id", "==", uid)
        .where("deleted_at", "==", null)
        .get(),
    ]);

    const docsToDelete = new Map<string, typeof snapUserId.docs[0]>();
    for (const snap of [snapUserId, snapUserIdSnake]) {
      for (const d of snap.docs) {
        const rel = (d.data().relative_path as string) ?? "";
        const isFile = rel === safePath;
        const isInFolder = rel.startsWith(pathPrefix);
        if (isFile || isInFolder) {
          docsToDelete.set(d.id, d);
        }
      }
    }

    for (const d of docsToDelete.values()) {
      await d.ref.update({ deleted_at: FieldValue.serverTimestamp() });
      deleted++;
    }
  }

  if (deleted === 0) {
    return NextResponse.json({ error: "File or folder not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted });
}
