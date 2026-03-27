/**
 * POST /api/mount/delete
 * Soft-deletes a file or folder (sets deleted_at) for items in the mounted drive.
 * Used by WebDAV DELETE when user deletes from Finder.
 */
import { FieldValue } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logActivityEvent } from "@/lib/activity-log";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  applyMacosPackageDelta,
  mergeMacosPackageTrashDeltasInto,
} from "@/lib/macos-package-container-admin";
import { BACKUP_LIFECYCLE_ACTIVE, BACKUP_LIFECYCLE_TRASHED } from "@/lib/backup-file-lifecycle";
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
  let firstDeletedRel: string | null = null;
  const allDocs = new Map<string, QueryDocumentSnapshot>();

  for (const did of driveIds) {
    const [snapUserId, snapUserIdSnake] = await Promise.all([
      db
        .collection("backup_files")
        .where("linked_drive_id", "==", did)
        .where("userId", "==", uid)
        .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
        .get(),
      db
        .collection("backup_files")
        .where("linked_drive_id", "==", did)
        .where("user_id", "==", uid)
        .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
        .get(),
    ]);

    for (const snap of [snapUserId, snapUserIdSnake]) {
      for (const d of snap.docs) {
        const rel = (d.data().relative_path as string) ?? "";
        const isFile = rel === safePath;
        const isInFolder = rel.startsWith(pathPrefix);
        if (isFile || isInFolder) {
          allDocs.set(d.id, d);
          if (firstDeletedRel === null) firstDeletedRel = rel;
        }
      }
    }
  }

  const deleted = allDocs.size;
  if (deleted === 0) {
    return NextResponse.json({ error: "File or folder not found" }, { status: 404 });
  }

  const pkgDeltas = new Map<string, { count: number; bytes: number }>();
  for (const d of allDocs.values()) {
    mergeMacosPackageTrashDeltasInto(pkgDeltas, d.data());
  }

  const UPDATE_BATCH = 450;
  const docList = [...allDocs.values()];
  for (let i = 0; i < docList.length; i += UPDATE_BATCH) {
    const batch = db.batch();
    for (const d of docList.slice(i, i + UPDATE_BATCH)) {
      batch.update(d.ref, {
        deleted_at: FieldValue.serverTimestamp(),
        lifecycle_state: BACKUP_LIFECYCLE_TRASHED,
      });
    }
    await batch.commit();
  }

  if (pkgDeltas.size > 0) {
    await applyMacosPackageDelta(db, pkgDeltas);
  }

  const targetName = safePath.split("/").pop() ?? safePath;
  const isFile = firstDeletedRel === safePath;

  logActivityEvent({
    event_type: isFile ? "file_deleted" : "folder_deleted",
    actor_user_id: uid,
    scope_type: "personal_account",
    linked_drive_id: driveIds[0] ?? driveId,
    target_type: isFile ? "file" : "folder",
    target_name: targetName,
    file_path: safePath,
    metadata: { deleted_count: deleted },
  }).catch(() => {});

  return NextResponse.json({ ok: true, deleted });
}
