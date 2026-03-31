/**
 * GET /api/galleries/[id]/preview-url?object_key=...&name=...&password=...
 * Signed read URL with inline disposition for in-browser preview (PDF, audio).
 * Verifies gallery view access (same gate as thumbnails / video stream).
 */
import { getProxyObjectKey, isB2Configured, objectExists } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { isGalleryAssetOmittedFromFinalVideoDelivery } from "@/lib/gallery-final-video-delivery-asset-filter";
import { NextResponse } from "next/server";

const PREVIEW_EXT = /\.(pdf|mp3|wav|ogg|m4a|aac|flac)$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { id: galleryId } = await params;
  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const password = url.searchParams.get("password") ?? undefined;

  if (!galleryId || !objectKey) {
    return NextResponse.json({ error: "object_key required" }, { status: 400 });
  }
  if (!PREVIEW_EXT.test(name) && !PREVIEW_EXT.test(objectKey)) {
    return NextResponse.json({ error: "Unsupported file type for preview URL" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

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
    return NextResponse.json(
      { error: access.code, message: access.message, needsPassword: access.needsPassword },
      { status: 403 }
    );
  }

  const assetSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .where("object_key", "==", objectKey)
    .where("is_visible", "==", true)
    .limit(1)
    .get();

  if (assetSnap.empty) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const backupFileId = assetSnap.docs[0]!.data().backup_file_id as string | undefined;
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
      backupFileId
    )
  ) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  try {
    const proxyKey = getProxyObjectKey(objectKey);
    const effectiveKey = (await objectExists(proxyKey)) ? proxyKey : objectKey;
    const signedUrl = await getDownloadUrl(effectiveKey, 3600, undefined, true);
    return NextResponse.json({ url: signedUrl });
  } catch (err) {
    console.error("[gallery preview-url]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create preview URL" },
      { status: 500 }
    );
  }
}
