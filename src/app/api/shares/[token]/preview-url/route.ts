import { objectExists, getProxyObjectKey } from "@/lib/b2";
import { getDownloadUrl, isB2Configured } from "@/lib/cdn";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyShareAccess } from "@/lib/share-access";
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

  const ownerId = share.owner_id as string;
  const referencedFileIds = share.referenced_file_ids as string[] | undefined;
  const isVirtualShare = Array.isArray(referencedFileIds) && referencedFileIds.length > 0;

  let fileSnap;
  if (isVirtualShare) {
    fileSnap = await db
      .collection("backup_files")
      .where("userId", "==", ownerId)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    if (!fileSnap.empty && !referencedFileIds.includes(fileSnap.docs[0].id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  } else {
    const linkedDriveId = share.linked_drive_id as string;
    fileSnap = await db
      .collection("backup_files")
      .where("userId", "==", ownerId)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
  }

  if (fileSnap.empty || fileSnap.docs[0].data().deleted_at) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const proxyKey = getProxyObjectKey(objectKey);
    const effectiveKey = (await objectExists(proxyKey)) ? proxyKey : objectKey;
    const url = await getDownloadUrl(effectiveKey, 3600);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Share preview URL error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create preview URL",
      },
      { status: 500 }
    );
  }
}
