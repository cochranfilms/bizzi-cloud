/**
 * GET /api/galleries/[id]/video-stream-url?object_key=...&name=...&password=...
 * Returns stream URL for video playback in public gallery. Verifies gallery view access.
 */
import { isB2Configured, objectExists, getProxyObjectKey } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { getMuxAssetStatus } from "@/lib/mux";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";

const STREAM_EXPIRY_SEC = 3600; // 1 hour — prevents Access Denied when users pause or return to gallery videos

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

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
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key") ?? "";
  const password = url.searchParams.get("password") ?? null;

  const name = url.searchParams.get("name") ?? "";
  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key required" }, { status: 400 });
  }
  if (!VIDEO_EXT.test(objectKey) && !VIDEO_EXT.test(name)) {
    return NextResponse.json({ error: "object_key and name must reference a video file" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

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
    { authHeader, password: password ?? undefined, clientEmail }
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

  try {
    const backupFileId = assetSnap.docs[0].data().backup_file_id as string | undefined;
    let muxPlaybackId: string | undefined;
    let muxAssetId: string | undefined;
    let storedStatus: string | undefined;

    if (backupFileId) {
      const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
      if (fileSnap.exists) {
        const fd = fileSnap.data()!;
        muxPlaybackId = fd.mux_playback_id as string | undefined;
        muxAssetId = fd.mux_asset_id as string | undefined;
        storedStatus = fd.mux_status as string | undefined;
      }
    }

    if (muxPlaybackId && muxAssetId) {
      const status = storedStatus === "ready" ? "ready" : await getMuxAssetStatus(muxAssetId);
      if (status === "ready") {
        const streamUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8?max_resolution=720p`;
        /** Mux caps animated GIF/WebP at 640px; this is the highest-quality animated preview they serve. */
        const animatedMuxPreviewUrl = `https://image.mux.com/${muxPlaybackId}/animated.gif?width=640&fps=15`;
        return NextResponse.json({
          streamUrl,
          isHls: true,
          animatedMuxPreviewUrl,
        });
      }
      const proxyKey = getProxyObjectKey(objectKey);
      const proxyExists = await objectExists(proxyKey);
      if (proxyExists) {
        const streamUrl = await getDownloadUrl(proxyKey, STREAM_EXPIRY_SEC);
        return NextResponse.json({ streamUrl });
      }
      return NextResponse.json({
        processing: true,
        message: "Video is still processing. Check back soon to preview.",
      });
    }

    const proxyKey = getProxyObjectKey(objectKey);
    const proxyExists = await objectExists(proxyKey);
    const effectiveKey = proxyExists ? proxyKey : objectKey;
    const streamUrl = await getDownloadUrl(effectiveKey, STREAM_EXPIRY_SEC);
    return NextResponse.json({ streamUrl });
  } catch (err) {
    console.error("[gallery video-stream-url] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create stream URL" },
      { status: 500 }
    );
  }
}
