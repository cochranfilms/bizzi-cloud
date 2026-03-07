import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const shareSnap = await db.collection("folder_shares").doc(token).get();

  if (!shareSnap.exists) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const share = shareSnap.data();
  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const expiresAt = share.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ error: "Share expired" }, { status: 410 });
  }

  const linkedDriveId = share.linked_drive_id as string;
  const ownerId = share.owner_id as string;

  // Get drive name
  const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
  const driveName = driveSnap.exists
    ? (driveSnap.data()?.name ?? "Shared folder")
    : "Shared folder";

  // Get files in this drive (non-deleted)
  const filesSnap = await db
    .collection("backup_files")
    .where("userId", "==", ownerId)
    .where("linked_drive_id", "==", linkedDriveId)
    .where("deleted_at", "==", null)
    .get();

  const files = filesSnap.docs.map((d) => {
    const data = d.data();
    const path = (data.relative_path ?? "") as string;
    const name = path.split("/").filter(Boolean).pop() ?? path ?? "?";
    return {
      id: d.id,
      name,
      path,
      object_key: data.object_key ?? "",
      size_bytes: data.size_bytes ?? 0,
    };
  });

  return NextResponse.json({
    folder_name: driveName,
    permission: share.permission ?? "view",
    files,
  });
}
