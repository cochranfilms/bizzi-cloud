/**
 * GET /api/galleries/[id]/thumbnail?object_key=...&name=...&size=...
 * Serves resized image for gallery display. Verifies gallery view access.
 * Supports standard images (Sharp) and RAW files (exiftool + Sharp).
 * Sizes: thumb, small, medium, large, preview (square fit)
 *       cover-xs, cover-sm, cover-md, cover-lg, cover-xl (width-based, cached)
 */
import { getClientEmailFromCookie } from "@/lib/client-session";
import {
  getObjectHeadBuffer,
  getObjectBuffer,
  isB2Configured,
  objectExists,
  putObject,
  getCoverDerivativeCacheKey,
} from "@/lib/b2";
import { COVER_DERIVATIVE_WIDTHS } from "@/lib/cover-constants";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { GALLERY_IMAGE_EXT, isRawStillFile } from "@/lib/gallery-file-types";
import { isRawVideoFile, RAW_VIDEO_USE_VIDEO_THUMBNAIL_CODE } from "@/lib/raw-video";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import {
  GALLERY_PREVIEW_STATUS_HEADER,
  PREVIEW_STATUS_OK,
  PREVIEW_STATUS_UNAVAILABLE,
} from "@/lib/gallery-preview-headers";
import { rawToThumbnail } from "@/lib/raw-thumbnail";
import { isGalleryAssetOmittedFromFinalVideoDelivery } from "@/lib/gallery-final-video-delivery-asset-filter";
import { NextResponse } from "next/server";
import sharp from "sharp";

const SIZES = { thumb: 256, small: 512, medium: 1024, large: 1920, preview: 1920 } as const;

let transparentPng1x1: Buffer | null = null;
async function getTransparentPng1x1(): Promise<Buffer> {
  if (!transparentPng1x1) {
    transparentPng1x1 = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  }
  return transparentPng1x1;
}
const COVER_SIZES = COVER_DERIVATIVE_WIDTHS;

function isImageFile(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name);
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

  const leafForPolicy = fileName || objectKey || "";
  if (!galleryId || !objectKey) {
    return new NextResponse("gallery id and object_key required", { status: 400 });
  }
  if (isRawVideoFile(leafForPolicy)) {
    return NextResponse.json(
      {
        error: "Cinema RAW video must use the gallery video-thumbnail endpoint.",
        code: RAW_VIDEO_USE_VIDEO_THUMBNAIL_CODE,
      },
      { status: 400 }
    );
  }
  if (!isImageFile(leafForPolicy)) {
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

  const thumbBackupId = assetSnap.docs[0]!.data().backup_file_id as string | undefined;
  if (
    await isGalleryAssetOmittedFromFinalVideoDelivery(
      db,
      {
        id: galleryId,
        gallery_type: g.gallery_type,
        media_mode: g.media_mode,
        source_format: g.source_format,
        media_folder_segment: g.media_folder_segment,
      },
      thumbBackupId
    )
  ) {
    return new NextResponse("Asset not found", { status: 404 });
  }

  const nameForExt = (fileName || objectKey || "").toLowerCase();
  const isRaw = isRawStillFile(nameForExt);

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
                ...(isRaw
                  ? { [GALLERY_PREVIEW_STATUS_HEADER]: PREVIEW_STATUS_OK }
                  : {}),
              },
            });
          }
        }
      } catch {
        // Regenerate
      }

      const THUMB_MAX_BYTES = 50 * 1024 * 1024;
      const buffer = await getObjectHeadBuffer(objectKey, THUMB_MAX_BYTES);
      let resized: Uint8Array;
      if (isRaw) {
        let thumb: Buffer | null = null;
        try {
          thumb = await rawToThumbnail(
            Buffer.from(buffer),
            nameForExt || "raw",
            coverWidth,
            { isCover: true }
          );
        } catch (e) {
          console.warn("[gallery thumbnail] RAW preview error for", fileName, (e as Error)?.message ?? e);
        }
        if (!thumb) {
          return new NextResponse(new Uint8Array(await getTransparentPng1x1()), {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "private, no-store",
              [GALLERY_PREVIEW_STATUS_HEADER]: PREVIEW_STATUS_UNAVAILABLE,
            },
          });
        }
        resized = new Uint8Array(thumb);
      } else {
        resized = new Uint8Array(
          await sharp(buffer)
            .rotate()
            .resize({ width: coverWidth, withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer()
        );
      }

      putObject(cacheKey, resized, "image/jpeg").catch(() => {});

      return new NextResponse(Buffer.from(resized), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400, immutable",
          ...(isRaw
            ? { [GALLERY_PREVIEW_STATUS_HEADER]: PREVIEW_STATUS_OK }
            : {}),
        },
      });
    }

    const THUMB_MAX_BYTES = 50 * 1024 * 1024;
    const buffer = await getObjectHeadBuffer(objectKey, THUMB_MAX_BYTES);
    let resized: Uint8Array;
    if (isRaw) {
      let thumb: Buffer | null = null;
      try {
        thumb = await rawToThumbnail(
          Buffer.from(buffer),
          nameForExt || "raw",
          squareSize,
          { fit: "inside" }
        );
      } catch (e) {
        console.warn("[gallery thumbnail] RAW preview error for", fileName, (e as Error)?.message ?? e);
      }
      if (!thumb) {
        return new NextResponse(new Uint8Array(await getTransparentPng1x1()), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, no-store",
            [GALLERY_PREVIEW_STATUS_HEADER]: PREVIEW_STATUS_UNAVAILABLE,
          },
        });
      }
      resized = new Uint8Array(thumb);
    } else {
      resized = new Uint8Array(
        await sharp(buffer)
          .rotate()
          .resize(squareSize, squareSize, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer()
      );
    }

    return new NextResponse(Buffer.from(resized), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
        ...(isRaw ? { [GALLERY_PREVIEW_STATUS_HEADER]: PREVIEW_STATUS_OK } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Thumbnail failed";
    console.error("[gallery thumbnail] Error:", msg);
    return new NextResponse(msg, { status: 500 });
  }
}
