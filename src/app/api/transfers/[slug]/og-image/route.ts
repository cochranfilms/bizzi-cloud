import { getObjectHeadBuffer, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import sharp from "sharp";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;
const OG_SIZE = 1200;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const { slug } = await params;
  if (!slug || typeof slug !== "string") {
    return new NextResponse("Invalid slug", { status: 400 });
  }

  const db = getAdminFirestore();
  const transferSnap = await db.collection("transfers").doc(slug).get();
  if (!transferSnap.exists) {
    return new NextResponse("Transfer not found", { status: 404 });
  }

  const data = transferSnap.data();
  if (!data) return new NextResponse("Transfer not found", { status: 404 });

  const expiresAt = data.expires_at ?? null;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return new NextResponse("Transfer expired", { status: 410 });
  }

  const files = (data.files ?? []) as Array<{ name: string; object_key?: string; backup_file_id?: string }>;
  const firstFile = files[0];
  if (!firstFile?.object_key) {
    return new NextResponse("No file thumbnail available", { status: 404 });
  }

  const objectKey = firstFile.object_key as string;
  const fileName = firstFile.name ?? "";

  if (isImageFile(fileName || objectKey)) {
    try {
      const buffer = await getObjectHeadBuffer(objectKey, 50 * 1024 * 1024);
      const resized = await sharp(buffer)
        .resize(OG_SIZE, OG_SIZE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      return new NextResponse(new Uint8Array(resized), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (err) {
      console.error("[transfer og-image] Image error:", err);
      return new NextResponse("Thumbnail failed", { status: 500 });
    }
  }

  if (VIDEO_EXT.test(fileName || objectKey)) {
    try {
      const { getTransferVideoThumbnail } = await import("@/lib/transfer-video-thumbnail");
      const buffer = await getTransferVideoThumbnail(objectKey);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (err) {
      console.error("[transfer og-image] Video thumbnail error:", err);
      return new NextResponse("Video thumbnail not available", { status: 503 });
    }
  }

  return new NextResponse("No preview for this file type", { status: 404 });
}
