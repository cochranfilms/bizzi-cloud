import { createPresignedDownloadUrl, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { token } = await params;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const objectKey = body.object_key ?? body.objectKey;

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json(
      { error: "object_key is required" },
      { status: 400 }
    );
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

  // Verify the object_key belongs to this share (file is in the shared drive)
  const fileSnap = await db
    .collection("backup_files")
    .where("userId", "==", ownerId)
    .where("linked_drive_id", "==", linkedDriveId)
    .where("object_key", "==", objectKey)
    .limit(1)
    .get();

  if (fileSnap.empty) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (fileSnap.docs[0].data().deleted_at) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const url = await createPresignedDownloadUrl(objectKey, 3600);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Share download URL error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create download URL",
      },
      { status: 500 }
    );
  }
}
