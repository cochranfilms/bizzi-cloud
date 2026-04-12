/**
 * GET /api/files/storage-folder-roots
 * First path segment under Storage (e.g. migration subfolders) for Bizzi Cloud Folders on home.
 * Mirrors drive-item-counts access rules (personal + team).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  BACKUP_LIFECYCLE_ACTIVE,
  BACKUP_LIFECYCLE_TRASHED,
  isBackupFileActiveForListing,
  resolveBackupFileLifecycleState,
} from "@/lib/backup-file-lifecycle";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertStorageLifecycleAllowsAccess } from "@/lib/storage-lifecycle";
import {
  compareStorageFolderRowsTransfersRootFirst,
  getStorageFolderCoverFile,
  listStorageFolderChildren,
} from "@/lib/storage-folders";
import {
  fileBelongsToPersonalTeamContainer,
  fileVisibleOnPersonalDashboard,
  isPersonalDashboardDriveDoc,
  isTeamContainerDriveDoc,
} from "@/lib/backup-scope";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

const PERSONAL_DRIVE_PAGE = 500;

function addTopLevelSegments(
  map: Map<string, number>,
  d: Record<string, unknown>,
  trashOnly: boolean
): void {
  if (trashOnly) {
    if (resolveBackupFileLifecycleState(d) !== BACKUP_LIFECYCLE_TRASHED) return;
  } else if (!isBackupFileActiveForListing(d)) {
    return;
  }
  const relativePath = (d.relative_path as string) ?? "";
  if (!relativePath.includes("/")) return;
  const seg = relativePath.split("/")[0]?.trim();
  if (!seg) return;
  map.set(seg, (map.get(seg) ?? 0) + 1);
}

async function walkPersonalDriveForSegments(
  db: Firestore,
  driveId: string,
  uid: string,
  trashOnly: boolean,
  rowScope: (data: Record<string, unknown>) => boolean
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection("backup_files")
      .where("linked_drive_id", "==", driveId)
      .where("organization_id", "==", null)
      .orderBy("uploaded_at", "desc")
      .limit(PERSONAL_DRIVE_PAGE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      if (!rowScope(d)) continue;
      addTopLevelSegments(map, d, trashOnly);
    }
    if (snap.docs.length < PERSONAL_DRIVE_PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return map;
}

type StorageFolderRootRow = {
  drive_id: string;
  name: string;
  path: string;
  file_count: number;
  storage_folder_id?: string;
  storage_folder_version?: number;
  operation_state?: string;
  lifecycle_state?: string;
  /** Matches storage_folders + FileGrid: block user delete/move/rename in UI. */
  system_folder_role?: string;
  protected_deletion?: boolean;
  /** Firestore timestamps — used only for sibling sort (newest first) after JSON. */
  updated_at?: unknown;
  created_at?: unknown;
  cover_file?: {
    object_key: string;
    file_name: string;
    content_type: string | null;
  } | null;
};

/** Merge Google/Dropbox-import path prefixes (e.g. `imported/…`) with v2 `storage_folders` tiles on home. */
function appendV2PathSegmentTiles(
  driveId: string,
  segmentCounts: Map<string, number>,
  folders: StorageFolderRootRow[]
): void {
  const v2Names = new Set(
    folders
      .filter((f) => typeof f.storage_folder_id === "string" && f.storage_folder_id.length > 0)
      .map((f) => f.name.toLowerCase())
  );
  for (const [name, file_count] of segmentCounts.entries()) {
    if (v2Names.has(name.toLowerCase())) continue;
    folders.push({ drive_id: driveId, name, path: name, file_count });
  }
}

/** Cap promoted nested folders per drive (direct children of any root) — keeps home strip fast. */
const MAX_PROMOTED_NESTED_FOLDERS_PER_DRIVE = 24;

async function v2FolderDocToRootRow(
  db: Firestore,
  driveId: string,
  f: Record<string, unknown> & { id?: string }
): Promise<StorageFolderRootRow | null> {
  const fid = String(f.id ?? "").trim();
  const fname = String(f.name ?? "").trim();
  if (!fid || !fname) return null;

  const { folders: subFolders } = await listStorageFolderChildren(db, driveId, fid);
  const filesSnap = await db
    .collection("backup_files")
    .where("linked_drive_id", "==", driveId)
    .where("folder_id", "==", fid)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .select()
    .limit(500)
    .get();

  const itemCount = subFolders.length + filesSnap.size;
  const ver = f.version;
  const roleRaw = f.system_folder_role;
  const system_folder_role =
    typeof roleRaw === "string" && roleRaw.trim() ? roleRaw.trim() : undefined;
  const protected_deletion = f.protected_deletion === true;
  let cover_file: StorageFolderRootRow["cover_file"] = null;
  try {
    cover_file = await getStorageFolderCoverFile(db, driveId, fid);
  } catch {
    cover_file = null;
  }
  return {
    drive_id: driveId,
    name: fname,
    path: "",
    file_count: itemCount,
    storage_folder_id: fid,
    storage_folder_version: typeof ver === "number" ? ver : Number(ver ?? 1),
    operation_state: typeof f.operation_state === "string" ? f.operation_state : undefined,
    lifecycle_state: typeof f.lifecycle_state === "string" ? f.lifecycle_state : undefined,
    ...(system_folder_role ? { system_folder_role } : {}),
    ...(protected_deletion ? { protected_deletion: true as const } : {}),
    ...(f.updated_at != null ? { updated_at: f.updated_at } : {}),
    ...(f.created_at != null ? { created_at: f.created_at } : {}),
    cover_file,
  };
}

/**
 * Root `storage_folders` rows for folder model v2 (home “Bizzi Cloud Folders”).
 * Also promotes **direct children** of those roots into the same list so nested folders
 * appear alongside top-level folders and participate in the global recency sort.
 */
async function appendV2StorageRootFolderRows(
  db: Firestore,
  driveId: string,
  folders: StorageFolderRootRow[]
): Promise<void> {
  const { folders: v2Roots } = await listStorageFolderChildren(db, driveId, null);
  const pushedFolderIds = new Set<string>();
  const nestedCandidates: Record<string, unknown>[] = [];

  for (const raw of v2Roots) {
    const f = raw as Record<string, unknown> & { id?: string };
    const fid = String(f.id ?? "").trim();
    const fname = String(f.name ?? "").trim();
    if (!fid || !fname) continue;

    const { folders: subFolders } = await listStorageFolderChildren(db, driveId, fid);
    const filesSnap = await db
      .collection("backup_files")
      .where("linked_drive_id", "==", driveId)
      .where("folder_id", "==", fid)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .select()
      .limit(500)
      .get();

    const itemCount = subFolders.length + filesSnap.size;
    const ver = f.version;
    const roleRaw = f.system_folder_role;
    const system_folder_role =
      typeof roleRaw === "string" && roleRaw.trim() ? roleRaw.trim() : undefined;
    const protected_deletion = f.protected_deletion === true;
    let cover_file: StorageFolderRootRow["cover_file"] = null;
    try {
      cover_file = await getStorageFolderCoverFile(db, driveId, fid);
    } catch {
      cover_file = null;
    }
    folders.push({
      drive_id: driveId,
      name: fname,
      path: "",
      file_count: itemCount,
      storage_folder_id: fid,
      storage_folder_version: typeof ver === "number" ? ver : Number(ver ?? 1),
      operation_state: typeof f.operation_state === "string" ? f.operation_state : undefined,
      lifecycle_state: typeof f.lifecycle_state === "string" ? f.lifecycle_state : undefined,
      ...(system_folder_role ? { system_folder_role } : {}),
      ...(protected_deletion ? { protected_deletion: true as const } : {}),
      ...(f.updated_at != null ? { updated_at: f.updated_at } : {}),
      ...(f.created_at != null ? { created_at: f.created_at } : {}),
      cover_file,
    });
    pushedFolderIds.add(fid);

    for (const sub of subFolders) {
      const doc = sub as Record<string, unknown> & { id?: string };
      const sid = String(doc.id ?? "").trim();
      if (!sid || pushedFolderIds.has(sid)) continue;
      nestedCandidates.push(doc);
    }
  }

  nestedCandidates.sort((a, b) => compareStorageFolderRowsTransfersRootFirst(a, b));

  let nestedAdded = 0;
  for (const doc of nestedCandidates) {
    if (nestedAdded >= MAX_PROMOTED_NESTED_FOLDERS_PER_DRIVE) break;
    const sid = String((doc as { id?: string }).id ?? "").trim();
    if (!sid || pushedFolderIds.has(sid)) continue;
    pushedFolderIds.add(sid);
    const row = await v2FolderDocToRootRow(db, driveId, { ...doc, id: sid });
    if (row) folders.push(row);
    nestedAdded++;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const rl = checkRateLimit(`storage-folder-roots:${uid}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    await assertStorageLifecycleAllowsAccess(uid);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Access restricted" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const teamOwnerId = url.searchParams.get("team_owner_id")?.trim() || null;
  const personal = url.searchParams.get("personal") === "1";
  const trashOnly = url.searchParams.get("deleted") === "only";
  const driveIdsParam = url.searchParams.get("drive_ids")?.trim();
  if (!driveIdsParam) {
    return NextResponse.json({ folders: [] as unknown[] });
  }
  const driveIds = driveIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (driveIds.length === 0) {
    return NextResponse.json({ folders: [] });
  }

  const db = getAdminFirestore();
  const folders: StorageFolderRootRow[] = [];

  if (personal) {
    if (teamOwnerId) {
      return NextResponse.json(
        { error: "Do not pass team_owner_id with personal=1" },
        { status: 400 }
      );
    }
    await Promise.all(
      driveIds.map(async (driveId) => {
        const driveSnap = await db.collection("linked_drives").doc(driveId).get();
        const data = driveSnap.data();
        const owner = (data?.userId ?? data?.user_id) as string | undefined;
        if (
          !data ||
          owner !== uid ||
          data.organization_id ||
          !isPersonalDashboardDriveDoc(data as Record<string, unknown>, uid)
        ) {
          return;
        }
        const map = await walkPersonalDriveForSegments(db, driveId, uid, trashOnly, (d) =>
          fileVisibleOnPersonalDashboard(d, uid)
        );
        const isV2 = Number(data.folder_model_version) === 2;
        if (trashOnly || !isV2) {
          for (const [name, file_count] of map.entries()) {
            folders.push({ drive_id: driveId, name, path: name, file_count });
          }
        }
        if (!trashOnly && isV2) {
          await appendV2StorageRootFolderRows(db, driveId, folders);
          appendV2PathSegmentTiles(driveId, map, folders);
        }
      })
    );
  } else if (teamOwnerId) {
    if (uid !== teamOwnerId) {
      const seatSnap = await db
        .collection("personal_team_seats")
        .doc(`${teamOwnerId}_${uid}`)
        .get();
      const st = seatSnap.data()?.status as string | undefined;
      if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    await Promise.all(
      driveIds.map(async (driveId) => {
        const driveSnap = await db.collection("linked_drives").doc(driveId).get();
        const data = driveSnap.data();
        if (
          !data ||
          data.userId !== teamOwnerId ||
          data.organization_id ||
          data.deleted_at ||
          !isTeamContainerDriveDoc(data as Record<string, unknown>, teamOwnerId)
        ) {
          return;
        }
        const map = await walkPersonalDriveForSegments(
          db,
          driveId,
          uid,
          trashOnly,
          (d) => fileBelongsToPersonalTeamContainer(d, teamOwnerId)
        );
        const isV2Team = Number(data.folder_model_version) === 2;
        if (trashOnly || !isV2Team) {
          for (const [name, file_count] of map.entries()) {
            folders.push({ drive_id: driveId, name, path: name, file_count });
          }
        }
        if (!trashOnly && isV2Team) {
          await appendV2StorageRootFolderRows(db, driveId, folders);
          appendV2PathSegmentTiles(driveId, map, folders);
        }
      })
    );
  } else {
    return NextResponse.json(
      { error: "personal=1 or team_owner_id required" },
      { status: 400 }
    );
  }

  folders.sort(compareStorageFolderRowsTransfersRootFirst);
  return NextResponse.json({ folders });
}
