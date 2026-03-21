/**
 * GET /api/storage/powerup-files-check
 * Returns whether the user has files in RAW or Gallery Media drives.
 * Used to show a warning before navigating to Change plan if downgrading power-up could hide files.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

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

  const db = getAdminFirestore();

  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", uid)
    .where("organization_id", "==", null)
    .get();

  const rawDriveIds: string[] = [];
  const galleryMediaDriveIds: string[] = [];

  for (const d of drivesSnap.docs) {
    const data = d.data();
    if (data.deleted_at) continue;
    if (data.is_creator_raw === true) {
      rawDriveIds.push(d.id);
    } else if (data.name === "Gallery Media") {
      galleryMediaDriveIds.push(d.id);
    }
  }

  let hasRawFiles = false;
  let hasGalleryMediaFiles = false;

  if (rawDriveIds.length > 0) {
    const batch = rawDriveIds.slice(0, 10);
    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("organization_id", "==", null)
      .where("deleted_at", "==", null)
      .where("linked_drive_id", "in", batch)
      .limit(1)
      .get();
    hasRawFiles = !filesSnap.empty;
  }

  if (galleryMediaDriveIds.length > 0) {
    const batch = galleryMediaDriveIds.slice(0, 10);
    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("organization_id", "==", null)
      .where("deleted_at", "==", null)
      .where("linked_drive_id", "in", batch)
      .limit(1)
      .get();
    hasGalleryMediaFiles = !filesSnap.empty;
  }

  return NextResponse.json({
    hasRawFiles,
    hasGalleryMediaFiles,
  });
}
