import { getDownloadUrl, isB2Configured } from "@/lib/cdn";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import {
  fetchBackupFileDataForObjectKey,
  resolvePreviewInlineEffectiveKey,
} from "@/lib/asset-delivery-resolve";
import { deliveryUseFirestoreProxyHints } from "@/lib/delivery-flags";
import {
  logDeliveryTelemetry,
  readPollingRequestHeader,
} from "@/lib/delivery-telemetry";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  const t0 = Date.now();
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { object_key: objectKey, user_id: userIdFromBody } = body;

  let uid: string;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization" },
        { status: 401 }
      );
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json(
      { error: "object_key is required" },
      { status: 400 }
    );
  }

  const rl = checkRateLimit(`preview-url:${uid}`, 300, 60_000); // 300 req/min per user
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const result = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!result.allowed) {
    console.warn("[preview-url] Access denied", {
      status: result.status,
      objectKeyPrefix: objectKey.slice(0, 60),
      uidPrefix: uid.slice(0, 8),
    });
    return NextResponse.json(
      { error: result.message ?? "Access denied" },
      { status: result.status ?? 403 }
    );
  }

  let headFallback = false;
  let fsReads: "none" | "single" = "none";
  try {
    let backupData: Record<string, unknown> | null = null;
    if (deliveryUseFirestoreProxyHints()) {
      backupData = await fetchBackupFileDataForObjectKey(objectKey);
      fsReads = "single";
    }
    const { effectiveKey, usedHead } = await resolvePreviewInlineEffectiveKey(
      objectKey,
      backupData
    );
    headFallback = usedHead;
    const url = await getDownloadUrl(effectiveKey, 3600, undefined, true);
    const res = NextResponse.json({ url });
    logDeliveryTelemetry({
      route: "/api/backup/preview-url",
      durationMs: Date.now() - t0,
      deliveryClass: effectiveKey === objectKey ? "source_inline" : "proxy_mp4",
      responseType: "json",
      approxPayloadBytes: JSON.stringify({ url }).length,
      headFallback,
      surface: "dashboard",
      pollingRequest: readPollingRequestHeader(request),
      firestoreReads: fsReads,
    });
    return res;
  } catch (err) {
    console.error("[preview-url] B2/CDN error:", err instanceof Error ? err.message : err, {
      objectKeyPrefix: objectKey?.slice?.(0, 60),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create preview URL" },
      { status: 500 }
    );
  }
}
