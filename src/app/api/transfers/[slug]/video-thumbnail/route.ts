import {
  objectExists,
  getObjectBuffer,
  isB2Configured,
} from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { getTransferVideoThumbnail } from "@/lib/transfer-video-thumbnail";
import { getVideoThumbnailCacheKey } from "@/lib/b2";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

/**
 * GET /api/transfers/[slug]/video-thumbnail?object_key=...&name=...
 * Serves video thumbnail using the same getTransferVideoThumbnail used by og-image and platform.
 */
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

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const fileName = url.searchParams.get("name") ?? "";

  if (!objectKey || !isVideoFile(fileName || objectKey)) {
    return new NextResponse("object_key and video name required", {
      status: 400,
    });
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

  const files = (data.files ?? []) as Array<{ object_key?: string; backup_file_id?: string }>;
  const fileInTransfer = files.find(
    (f) => f.object_key === objectKey || f.backup_file_id === objectKey
  );
  if (!fileInTransfer) {
    return new NextResponse("File not found in this transfer", { status: 403 });
  }

  try {
    // Use same getTransferVideoThumbnail as og-image - exact same platform code
    const cacheKey = getVideoThumbnailCacheKey(objectKey);
    try {
      if (await objectExists(cacheKey)) {
        const cached = await getObjectBuffer(cacheKey, 512 * 1024);
        if (cached.length > 0) {
          return new NextResponse(Uint8Array.from(cached), {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      }
    } catch {
      // Regenerate via getTransferVideoThumbnail
    }

    const buffer = await getTransferVideoThumbnail(objectKey);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Video thumbnail failed";
    console.error("[transfer video-thumbnail] Error:", msg);
    return new NextResponse("Video thumbnail not available", { status: 503 });
  }
}
