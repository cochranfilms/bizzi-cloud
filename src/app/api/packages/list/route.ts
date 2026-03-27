/**
 * GET /api/packages/list?drive_id=&folder_path=
 * Lists macOS package containers for a drive, optionally scoped to folder_path (parent of package root).
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  MACOS_PACKAGE_CONTAINERS_COLLECTION,
  macosPackageVisibleAtFolderPath,
} from "@/lib/macos-package-container-admin";
import { verifyBackupFileAccessWithGalleryFallback } from "@/lib/backup-access";
import { NextResponse } from "next/server";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const driveId = searchParams.get("drive_id") ?? "";
  const folderPath = searchParams.get("folder_path") ?? "";
  if (!driveId) {
    return NextResponse.json({ error: "drive_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection(MACOS_PACKAGE_CONTAINERS_COLLECTION)
    .where("linked_drive_id", "==", driveId)
    .limit(200)
    .get();

  const items: Record<string, unknown>[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const rootPath = (d.root_relative_path as string) ?? "";
    if (!macosPackageVisibleAtFolderPath(rootPath, folderPath)) continue;

    const member = await db
      .collection("backup_files")
      .where("macos_package_id", "==", doc.id)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .limit(1)
      .get();
    if (member.empty) continue;
    const ok = await verifyBackupFileAccessWithGalleryFallback(
      uid,
      member.docs[0].data().object_key as string
    );
    if (!ok) continue;

    items.push({
      id: doc.id,
      package_kind: d.package_kind ?? null,
      root_relative_path: rootPath,
      root_segment_name: d.root_segment_name ?? rootPath.split("/").pop(),
      display_label: d.display_label ?? null,
      file_count: d.file_count ?? 0,
      total_bytes: d.total_bytes ?? 0,
      last_activity_at:
        d.last_activity_at?.toDate?.()?.toISOString?.() ??
        (typeof d.last_activity_at === "string" ? d.last_activity_at : null),
    });
  }

  return NextResponse.json({ packages: items });
}
