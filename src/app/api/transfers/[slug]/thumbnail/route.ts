import { getObjectHeadBuffer, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import sharp from "sharp";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff?|heic)$/i;
const SIZES = { thumb: 256, preview: 1024 } as const;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

/**
 * GET /api/transfers/[slug]/thumbnail?object_key=...&name=...&size=thumb|preview
 * Serves image thumbnail for transfer file list. Uses same logic as shares/gallery.
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
  const sizeParam = (url.searchParams.get("size") ?? "thumb") as keyof typeof SIZES;
  const size = SIZES[sizeParam] ?? SIZES.thumb;
  const fileName = url.searchParams.get("name") ?? "";

  if (!objectKey || !isImageFile(fileName || objectKey)) {
    return new NextResponse("object_key and image name required", { status: 400 });
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
    const buffer = await getObjectHeadBuffer(objectKey, 50 * 1024 * 1024);
    const resized = await sharp(buffer)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return new NextResponse(new Uint8Array(resized), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Thumbnail failed";
    console.error("[transfer thumbnail] Error:", msg);
    return new NextResponse(msg, { status: 500 });
  }
}
