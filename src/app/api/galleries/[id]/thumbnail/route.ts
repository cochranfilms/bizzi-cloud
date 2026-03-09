/**
 * GET /api/galleries/[id]/thumbnail?object_key=...&name=...&size=...
 * Serves resized image for gallery display. Verifies gallery view access.
 * Sizes: thumb, small, medium, large, preview (square fit)
 *       cover-xs, cover-sm, cover-md, cover-lg, cover-xl (width-based, cached)
 */
import { getClientEmailFromCookie } from "@/lib/client-session";
import {
  getObjectBuffer,
  isB2Configured,
  objectExists,
  putObject,
  getCoverDerivativeCacheKey,
} from "@/lib/b2";
import { COVER_DERIVATIVE_WIDTHS } from "@/lib/cover-constants";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";
import sharp from "sharp";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff?|heic)$/i;
const SIZES = { thumb: 256, small: 512, medium: 1024, large: 1920, preview: 1920 } as const;
const COVER_SIZES = COVER_DERIVATIVE_WIDTHS;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const { id: galleryId } = await params;
  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const sizeParam = url.searchParams.get("size") ?? "thumb";
  const isCoverSize = sizeParam in COVER_SIZES;
  const coverWidth = isCoverSize ? COVER_SIZES[sizeParam as keyof typeof COVER_SIZES] : null;
  const squareSize = (SIZES as Record<string, number>)[sizeParam] ?? SIZES.thumb;
  const fileName = url.searchParams.get("name") ?? "";
  const password = url.searchParams.get("password") ?? undefined;

  if (!galleryId || !objectKey || !isImageFile(fileName || objectKey)) {
    return new NextResponse("gallery id, object_key and image name required", { status: 400 });
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return new NextResponse("Gallery not found", { status: 404 });

  const g = gallerySnap.data()!;
  const authHeader = request.headers.get("Authorization");
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));
  const access = await verifyGalleryViewAccess(
    {
      photographer_id: g.photographer_id,
      access_mode: g.access_mode ?? "public",
      password_hash: g.password_hash,
      pin_hash: g.pin_hash,
      invited_emails: g.invited_emails ?? [],
      expiration_date: g.expiration_date,
    },
    { authHeader, password, clientEmail }
  );

  if (!access.allowed) {
    return new NextResponse("Access denied", { status: 403 });
  }

  const assetSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .where("object_key", "==", objectKey)
    .where("is_visible", "==", true)
    .limit(1)
    .get();

  if (assetSnap.empty) {
    return new NextResponse("Asset not found", { status: 404 });
  }

  try {
    if (isCoverSize && coverWidth) {
      const cacheKey = getCoverDerivativeCacheKey(objectKey, sizeParam);
      try {
        if (await objectExists(cacheKey)) {
          const cached = await getObjectBuffer(cacheKey, 10 * 1024 * 1024);
          if (cached.length > 0) {
            return new NextResponse(new Uint8Array(cached), {
              status: 200,
              headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=86400, immutable",
              },
            });
          }
        }
      } catch {
        // Regenerate
      }

      const buffer = await getObjectBuffer(objectKey);
      const resized = await sharp(buffer)
        .resize({ width: coverWidth, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();

      putObject(cacheKey, resized, "image/jpeg").catch(() => {});

      return new NextResponse(new Uint8Array(resized), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }

    const buffer = await getObjectBuffer(objectKey);
    const resized = await sharp(buffer)
      .resize(squareSize, squareSize, { fit: "inside", withoutEnlargement: true })
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
    console.error("[gallery thumbnail] Error:", msg);
    return new NextResponse(msg, { status: 500 });
  }
}
