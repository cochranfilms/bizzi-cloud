/**
 * POST /api/backup/asset-preview
 * Consolidated preview resolution (opt-gated): inline preview URL + video stream in one response.
 * When ASSET_PREVIEW_CONSOLIDATED is not set, returns 404 so only enabled deploys expose it.
 */
import { isB2Configured } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { assetPreviewConsolidatedEnabled } from "@/lib/delivery-flags";
import { resolvePreviewInlineEffectiveKey } from "@/lib/asset-delivery-resolve";
import { resolveBackupVideoStreamPayloadFromSnap } from "@/lib/backup-video-stream-resolve";
import {
  logDeliveryTelemetry,
  readPollingRequestHeader,
} from "@/lib/delivery-telemetry";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  const t0 = Date.now();

  if (!assetPreviewConsolidatedEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { object_key: objectKey, user_id: userIdFromBody, preview_kind: previewKind } = body;

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

  const rl = checkRateLimit(`asset-preview:${uid}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const access = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message ?? "Access denied" },
      { status: access.status ?? 403 }
    );
  }

  const kind =
    typeof previewKind === "string" && previewKind === "video" ? "video" : "inline";

  let fsReads: "none" | "single" | "batch" = "none";
  try {
    const db = getAdminFirestore();
    const muxSnap = await db
      .collection("backup_files")
      .where("object_key", "==", objectKey)
      .limit(5)
      .get();
    fsReads = "single";

    const backupData =
      (muxSnap.docs[0]?.data() as Record<string, unknown> | undefined) ?? null;

    const { effectiveKey, usedHead } = await resolvePreviewInlineEffectiveKey(
      objectKey,
      backupData
    );
    const previewUrl = await getDownloadUrl(effectiveKey, 3600, undefined, true);

    if (kind !== "video") {
      const res = NextResponse.json({
        previewUrl,
        video: null,
      });
      logDeliveryTelemetry({
        route: "/api/backup/asset-preview",
        durationMs: Date.now() - t0,
        deliveryClass: effectiveKey === objectKey ? "source_inline" : "proxy_mp4",
        responseType: "json",
        approxPayloadBytes: 0,
        headFallback: usedHead,
        surface: "dashboard",
        pollingRequest: readPollingRequestHeader(request),
        firestoreReads: fsReads,
      });
      return res;
    }

    const videoPayload = await resolveBackupVideoStreamPayloadFromSnap(uid, objectKey, muxSnap);
    const bodyOut = {
      previewUrl,
      video: videoPayload,
    };
    const res = NextResponse.json(bodyOut);
    logDeliveryTelemetry({
      route: "/api/backup/asset-preview",
      durationMs: Date.now() - t0,
      deliveryClass: "unknown",
      responseType: "json",
      headFallback: usedHead,
      surface: "dashboard",
      pollingRequest: readPollingRequestHeader(request),
      firestoreReads: fsReads,
    });
    return res;
  } catch (err) {
    console.error("[asset-preview]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve preview" },
      { status: 500 }
    );
  }
}
