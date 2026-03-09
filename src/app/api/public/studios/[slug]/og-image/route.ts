/**
 * GET /api/public/studios/[slug]/og-image
 * Serves the link preview image for a photographer's public homepage (bizzicloud.io/p/[slug]).
 * Uses profile's share_image_* or falls back to first gallery cover.
 * Supports RAW files via rawToThumbnail.
 */
import {
  getObjectBuffer,
  isB2Configured,
} from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT, isRawFile } from "@/lib/gallery-file-types";
import { rawToThumbnail } from "@/lib/raw-thumbnail";
import { NextResponse } from "next/server";
import sharp from "sharp";

const OG_SIZE = 1200;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isB2Configured()) {
    return new NextResponse("Storage not configured", { status: 503 });
  }

  const { slug } = await params;
  if (!slug || typeof slug !== "string") {
    return new NextResponse("Invalid slug", { status: 400 });
  }

  const db = getAdminFirestore();
  const normalizedSlug = slug.toLowerCase().trim();

  const profilesSnap = await db
    .collection("profiles")
    .where("public_slug", "==", normalizedSlug)
    .limit(1)
    .get();

  if (profilesSnap.empty) {
    return new NextResponse("Profile not found", { status: 404 });
  }

  const profileData = profilesSnap.docs[0].data();
  let objectKey: string | null = profileData.share_image_object_key ?? null;
  let fileName: string = profileData.share_image_name ?? "";
  let galleryId: string | null = profileData.share_image_gallery_id ?? null;

  if (!objectKey || !fileName) {
    const photographerId = profilesSnap.docs[0].id;
    const galleriesSnap = await db
      .collection("galleries")
      .where("photographer_id", "==", photographerId)
      .where("access_mode", "==", "public")
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    if (galleriesSnap.empty) {
      return new NextResponse("No preview available", { status: 404 });
    }

    const coverId = galleriesSnap.docs[0].data().cover_asset_id ?? null;
    galleryId = galleriesSnap.docs[0].id;
    const assetsSnap = await db
      .collection("gallery_assets")
      .where("gallery_id", "==", galleryId)
      .where("is_visible", "==", true)
      .orderBy("sort_order", "asc")
      .get();

    const assets = assetsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? "",
        object_key: data.object_key ?? "",
      };
    });
    const imageAssets = assets.filter((a) => GALLERY_IMAGE_EXT.test(a.name));
    const coverAsset = coverId
      ? imageAssets.find((a) => a.id === coverId)
      : imageAssets[0];
    if (!coverAsset?.object_key) {
      return new NextResponse("No preview available", { status: 404 });
    }
    objectKey = coverAsset.object_key;
    fileName = coverAsset.name;
  }

  const nameForExt = (fileName || objectKey || "").toLowerCase();

  try {
    if (GALLERY_IMAGE_EXT.test(nameForExt)) {
      const buffer = await getObjectBuffer(objectKey!);
      let resized: Buffer;

      if (isRawFile(nameForExt)) {
        const thumb = await rawToThumbnail(
          Buffer.from(buffer),
          nameForExt || "raw",
          OG_SIZE,
          { fit: "inside" }
        );
        resized = thumb ?? await sharp({
          create: {
            width: OG_SIZE,
            height: OG_SIZE,
            channels: 3,
            background: { r: 64, g: 64, b: 64 },
          },
        })
          .jpeg({ quality: 80 })
          .toBuffer();
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
      const buffer = await getTransferVideoThumbnail(objectKey!);
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
    console.error("[studio og-image] Error:", err);
    return new NextResponse("Preview failed", { status: 500 });
  }
}
