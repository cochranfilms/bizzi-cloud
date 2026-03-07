import { getObjectBuffer, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyShareAccess } from "@/lib/share-access";
import { NextResponse } from "next/server";
import sharp from "sharp";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff?|heic)$/i;
const SIZES = { thumb: 256, preview: 1024 } as const;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const { token: shareToken } = await params;

  if (!shareToken || typeof shareToken !== "string") {
    return new NextResponse("Invalid token", { status: 400 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const sizeParam = (url.searchParams.get("size") ?? "thumb") as keyof typeof SIZES;
  const size = SIZES[sizeParam] ?? SIZES.thumb;
  const fileName = url.searchParams.get("name") ?? "";

  if (!objectKey || !isImageFile(fileName || objectKey)) {
    return new NextResponse("object_key and image name required", { status: 400 });
  }

  const db = getAdminFirestore();
  const shareSnap = await db.collection("folder_shares").doc(shareToken).get();

  if (!shareSnap.exists) {
    return new NextResponse("Share not found", { status: 404 });
  }

  const share = shareSnap.data();
  if (!share) {
    return new NextResponse("Share not found", { status: 404 });
  }

  const expiresAt = share.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return new NextResponse("Share expired", { status: 410 });
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
    return new NextResponse("Access denied", { status: 403 });
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
    return new NextResponse("Access denied", { status: 403 });
  }

  try {
    const buffer = await getObjectBuffer(objectKey);
    const resized = await sharp(buffer)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return new NextResponse(new Uint8Array(resized), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Thumbnail failed";
    console.error("[share thumbnail] Error:", msg);
    return new NextResponse(msg, { status: 500 });
  }
}
