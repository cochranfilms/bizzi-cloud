import { isB2Configured, objectExists, getProxyObjectKey } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { getMuxAssetStatus } from "@/lib/mux";
import { verifyBackupFileAccessWithGalleryFallback } from "@/lib/backup-access";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const STREAM_EXPIRY_SEC = 600; // 10 minutes

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { object_key: objectKey, user_id: userIdFromBody } = body;

  let uid: string;
  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key is required" }, { status: 400 });
  }

  const hasAccess = await verifyBackupFileAccessWithGalleryFallback(uid, objectKey);
  if (!hasAccess) {
    console.warn("[video-stream-url] 403 Access denied", {
      uid,
      objectKeyPrefix: objectKey.slice(0, 50),
    });
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const db = getAdminFirestore();
    const muxSnap = await db
      .collection("backup_files")
      .where("object_key", "==", objectKey)
      .limit(5)
      .get();

    const muxDoc = muxSnap.docs.find((d) => d.data().mux_playback_id);
    const muxPlaybackId = muxDoc?.data()?.mux_playback_id as string | undefined;
    const muxAssetId = muxDoc?.data()?.mux_asset_id as string | undefined;
    const storedStatus = muxDoc?.data()?.mux_status as string | undefined;

    if (muxPlaybackId && muxAssetId) {
      const status = storedStatus === "ready" ? "ready" : await getMuxAssetStatus(muxAssetId);
      if (status === "ready") {
        if (storedStatus !== "ready" && muxDoc) {
          muxDoc.ref.update({ mux_status: "ready" }).catch(() => {});
        }
        const streamUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8?max_resolution=720p`;
        return NextResponse.json({ streamUrl, isHls: true });
      }
      // Mux not ready; fall back to 720p proxy if it exists (proxy pipeline may have completed)
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
    if (!proxyExists) {
      return NextResponse.json({
        processing: true,
        message: "Generating preview. Check back in a moment.",
        estimatedSeconds: 60,
      });
    }
    const streamUrl = await getDownloadUrl(proxyKey, STREAM_EXPIRY_SEC);
    return NextResponse.json({ streamUrl });
  } catch (err) {
    console.error("[video-stream-url] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create stream URL" },
      { status: 500 }
    );
  }
}
