/**
 * GET /api/public/galleries/og-image?handle=x&slug=y
 * Serves the link preview image for a branded gallery (bizzicloud.io/handle/gallery-slug).
 * Uses gallery's share_image_asset_id or falls back to cover_asset_id.
 * Supports RAW files via rawToThumbnail.
 */
import { getObjectHeadBuffer, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isReservedHandle } from "@/lib/public-handle";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT, isRawFile } from "@/lib/gallery-file-types";
import { rawToThumbnail } from "@/lib/raw-thumbnail";
import { NextResponse } from "next/server";
import sharp from "sharp";

const OG_SIZE = 1200;

export async function GET(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse("Storage not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const handle = url.searchParams.get("handle")?.toLowerCase().trim();
  const slug = url.searchParams.get("slug")?.toLowerCase().trim();

  if (!handle || !slug) {
    return new NextResponse("handle and slug required", { status: 400 });
  }

  if (isReservedHandle(handle)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getAdminFirestore();

  const profilesSnap = await db
    .collection("profiles")
    .where("public_slug", "==", handle)
    .limit(1)
    .get();

  if (profilesSnap.empty) {
    return new NextResponse("Profile not found", { status: 404 });
  }

  const photographerId = profilesSnap.docs[0].id;

  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", photographerId)
    .where("slug", "==", slug)
    .where("access_mode", "==", "public")
    .limit(1)
    .get();

  if (galleriesSnap.empty) {
    return new NextResponse("Gallery not found", { status: 404 });
  }

  const galleryDoc = galleriesSnap.docs[0];
  const galleryId = galleryDoc.id;
  const g = galleryDoc.data();

  const shareAssetId = g.share_image_asset_id ?? null;
  const coverAssetId = g.cover_asset_id ?? null;

  const assetsSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .where("is_visible", "==", true)
    .orderBy("sort_order", "asc")
    .get();

  const assets = assetsSnap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, name: data.name ?? "", object_key: data.object_key ?? "" };
  });
  const imageAssets = assets.filter((a) => GALLERY_IMAGE_EXT.test(a.name));
  const videoAssets = assets.filter((a) => GALLERY_VIDEO_EXT.test(a.name));

  const chosenAsset =
    (shareAssetId
      ? imageAssets.find((a) => a.id === shareAssetId) ??
        videoAssets.find((a) => a.id === shareAssetId)
      : null) ??
    (coverAssetId
      ? imageAssets.find((a) => a.id === coverAssetId) ??
        videoAssets.find((a) => a.id === coverAssetId)
      : null) ??
    imageAssets[0] ??
    videoAssets[0];

  if (!chosenAsset?.object_key) {
    return new NextResponse("No preview available", { status: 404 });
  }

  const objectKey = chosenAsset.object_key;
  const fileName = chosenAsset.name;
  const nameForExt = (fileName || objectKey).toLowerCase();

  try {
    if (GALLERY_IMAGE_EXT.test(nameForExt)) {
      const buffer = await getObjectHeadBuffer(objectKey, 50 * 1024 * 1024);
      let resized: Buffer;

      if (isRawFile(nameForExt)) {
        const thumb = await rawToThumbnail(
          Buffer.from(buffer),
          nameForExt || "raw",
          OG_SIZE,
          { fit: "inside" }
        );
        resized =
          thumb ??
          (await sharp({
            create: {
              width: OG_SIZE,
              height: OG_SIZE,
              channels: 3,
              background: { r: 64, g: 64, b: 64 },
            },
          })
            .jpeg({ quality: 80 })
            .toBuffer());
      } else {
        resized = await sharp(buffer)
          .rotate()
          .resize(OG_SIZE, OG_SIZE, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      }

      return new NextResponse(new Uint8Array(resized), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    if (GALLERY_VIDEO_EXT.test(nameForExt)) {
      const { getTransferVideoThumbnail } = await import("@/lib/transfer-video-thumbnail");
      const buffer = await getTransferVideoThumbnail(objectKey);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    return new NextResponse("No preview for this file type", { status: 404 });
  } catch (err) {
    console.error("[gallery og-image] Error:", err);
    return new NextResponse("Preview failed", { status: 500 });
  }
}
