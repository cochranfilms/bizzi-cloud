/**
 * POST /api/linked-drives/[driveId]/consolidate-into-storage
 * One-time migration: move all active files from a legacy custom linked drive into a new
 * root folder under the canonical Storage v2 drive, then mark the legacy drive as a reference.
 *
 * Body: { folder_name?: string } — display name for the new storage folder (default: drive name).
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  assertLinkedDriveWriteAccess,
  createStorageFolder,
  moveBackupFilesToDrive,
  StorageFolderAccessError,
} from "@/lib/storage-folders";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { NextResponse } from "next/server";
import type {
  Firestore,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "firebase-admin/firestore";

const MOVE_BATCH = 100;

function teamAwareBase(name: string): string {
  return name.replace(/^\[Team\]\s+/, "");
}

function normalizeStorageName(raw: string): string {
  return raw === "Uploads" ? "Storage" : raw;
}

function isLegacyCustomSource(data: Record<string, unknown>): boolean {
  if (data.deleted_at) return false;
  if (data.is_creator_raw === true) return false;
  if (data.creator_section === true) return false;
  if (data.is_org_shared === true) return false;
  if (typeof data.consolidated_into_storage_folder_id === "string") return false;
  const name = normalizeStorageName(String(data.name ?? ""));
  const base = teamAwareBase(name);
  if (base === "Storage" || base === "RAW" || base === "Gallery Media") return false;
  return true;
}

async function findCanonicalStorageV2Id(
  db: Firestore,
  source: Record<string, unknown>,
  sourceId: string,
): Promise<string | null> {
  const ownerUid = String(source.userId ?? "");
  const orgId = (source.organization_id as string | null) ?? null;
  const teamOwner = (source.personal_team_owner_id as string | null) ?? null;

  let snap: QuerySnapshot;
  if (orgId) {
    snap = await db
      .collection("linked_drives")
      .where("userId", "==", ownerUid)
      .where("organization_id", "==", orgId)
      .get();
  } else {
    snap = await db.collection("linked_drives").where("userId", "==", ownerUid).get();
  }

  const candidates: QueryDocumentSnapshot[] = [];
  for (const docSnap of snap.docs) {
    if (docSnap.id === sourceId) continue;
    const d = docSnap.data() as Record<string, unknown>;
    if (d.deleted_at) continue;
    const dOrg = (d.organization_id as string | null) ?? null;
    if (dOrg !== orgId) continue;
    const dTeam = (d.personal_team_owner_id as string | null) ?? null;
    if ((teamOwner ?? null) !== (dTeam ?? null)) continue;
    const base = teamAwareBase(normalizeStorageName(String(d.name ?? "")));
    if (base !== "Storage") continue;
    if (d.is_creator_raw === true) continue;
    if (Number(d.folder_model_version) !== 2) continue;
    candidates.push(docSnap);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const ta = (a.data().createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    const tb = (b.data().createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return ta - tb;
  });
  return candidates[0]!.id;
}

async function listActiveFileIdsOnDrive(db: Firestore, driveId: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  const page = 500;
  for (;;) {
    let q = db
      .collection("backup_files")
      .where("linked_drive_id", "==", driveId)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .orderBy("uploaded_at", "desc")
      .limit(page);
    if (cursor) q = q.startAfter(cursor);
    const s = await q.get();
    for (const docSnap of s.docs) ids.push(docSnap.id);
    if (s.size < page) break;
    cursor = s.docs[s.docs.length - 1];
  }
  return ids;
}

async function createFolderWithBackoff(
  db: Firestore,
  uid: string,
  storageId: string,
  displayName: string,
): Promise<string> {
  let attempt = displayName.trim() || "Folder";
  for (let i = 0; i < 8; i++) {
    try {
      const { id } = await createStorageFolder(db, uid, {
        linked_drive_id: storageId,
        parent_folder_id: null,
        name: attempt,
      });
      return id;
    } catch (e) {
      if (e instanceof StorageFolderAccessError && e.status === 409) {
        attempt = `${displayName.trim() || "Folder"} (${i + 2})`;
        continue;
      }
      throw e;
    }
  }
  throw new StorageFolderAccessError("Could not create destination folder (name conflict)", 409);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ driveId: string }> },
) {
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

  const { driveId: rawId } = await context.params;
  const driveId = String(rawId ?? "").trim();
  if (!driveId) {
    return NextResponse.json({ error: "driveId required" }, { status: 400 });
  }

  let body: { folder_name?: string };
  try {
    body = (await request.json()) as { folder_name?: string };
  } catch {
    body = {};
  }

  const db = getAdminFirestore();
  const sourceRef = db.collection("linked_drives").doc(driveId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  try {
    await assertLinkedDriveWriteAccess(db, uid, sourceSnap);
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const src = sourceSnap.data() as Record<string, unknown>;
  if (!isLegacyCustomSource(src)) {
    return NextResponse.json(
      { error: "This drive cannot be consolidated into Storage" },
      { status: 400 },
    );
  }

  const storageId = await findCanonicalStorageV2Id(db, src, driveId);
  if (!storageId) {
    return NextResponse.json(
      { error: "No Storage folder with the updated layout was found for this workspace" },
      { status: 400 },
    );
  }

  const defaultName = teamAwareBase(normalizeStorageName(String(src.name ?? "Folder")));
  const folderName =
    typeof body.folder_name === "string" && body.folder_name.trim()
      ? body.folder_name.trim()
      : defaultName;

  let newFolderId: string;
  try {
    newFolderId = await createFolderWithBackoff(db, uid, storageId, folderName);
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const fileIds = await listActiveFileIdsOnDrive(db, driveId);
  try {
    for (let i = 0; i < fileIds.length; i += MOVE_BATCH) {
      const chunk = fileIds.slice(i, i + MOVE_BATCH);
      await moveBackupFilesToDrive(db, uid, {
        file_ids: chunk,
        target_drive_id: storageId,
        target_folder_id: newFolderId,
      });
    }
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json(
        {
          error: e.message,
          partial: true,
          storage_folder_id: newFolderId,
          storage_linked_drive_id: storageId,
        },
        { status: e.status },
      );
    }
    throw e;
  }

  await sourceRef.update({
    consolidated_into_storage_folder_id: newFolderId,
    consolidated_into_linked_drive_id: storageId,
    consolidated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    storage_linked_drive_id: storageId,
    storage_folder_id: newFolderId,
    files_moved: fileIds.length,
  });
}
