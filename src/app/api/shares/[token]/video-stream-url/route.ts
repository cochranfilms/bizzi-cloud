import { createHmac } from "crypto";
import { isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyShareAccess } from "@/lib/share-access";
import { NextResponse } from "next/server";

const STREAM_EXPIRY_SEC = 600;

function signStreamUrl(objectKey: string, exp: number): string {
  const secret = process.env.B2_SECRET_ACCESS_KEY;
  if (!secret) throw new Error("B2_SECRET_ACCESS_KEY not set");
  const payload = `${objectKey}|${exp}`;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

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

  const { token: shareToken } = await params;

  if (!shareToken || typeof shareToken !== "string") {
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
  const shareSnap = await db.collection("folder_shares").doc(shareToken).get();

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

  const authHeader = request.headers.get("Authorization");
  const access = await verifyShareAccess(
    {
      owner_id: share.owner_id as string,
      access_level: share.access_level as string | undefined,
      invited_emails: share.invited_emails as string[] | undefined,
    },
    authHeader
  );

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.code, message: access.message },
      { status: 403 }
    );
  }

  const linkedDriveId = share.linked_drive_id as string;
  const ownerId = share.owner_id as string;

  const fileSnap = await db
    .collection("backup_files")
    .where("userId", "==", ownerId)
    .where("linked_drive_id", "==", linkedDriveId)
    .where("object_key", "==", objectKey)
    .limit(1)
    .get();

  if (fileSnap.empty || fileSnap.docs[0].data().deleted_at) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const exp = Math.floor(Date.now() / 1000) + STREAM_EXPIRY_SEC;
    const sig = signStreamUrl(objectKey, exp);
    const streamUrl = `/api/backup/video-stream?object_key=${encodeURIComponent(objectKey)}&exp=${exp}&sig=${sig}`;
    return NextResponse.json({ streamUrl });
  } catch (err) {
    console.error("[share video-stream-url] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create stream URL",
      },
      { status: 500 }
    );
  }
}
