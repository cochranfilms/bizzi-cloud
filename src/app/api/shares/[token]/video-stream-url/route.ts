import { isB2Configured, getProxyObjectKey } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { shareFirestoreDataToAccessDoc, verifyShareAccess } from "@/lib/share-access";
import { resolveProxyExistsForBackup } from "@/lib/asset-delivery-resolve";
import { deliveryUseFirestoreProxyHints } from "@/lib/delivery-flags";
import {
  logDeliveryTelemetry,
  readPollingRequestHeader,
} from "@/lib/delivery-telemetry";
import { NextResponse } from "next/server";

const STREAM_EXPIRY_SEC = 3600; // 1 hour — prevents Access Denied when users pause or return to share previews

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { token: shareToken } = await params;

  if (!shareToken || typeof shareToken !== "string") {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const objectKey = body.object_key ?? body.objectKey;

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json(
      { error: "object_key is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const shareSnap = await db.collection("folder_shares").doc(shareToken).get();

  if (!shareSnap.exists) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const share = shareSnap.data();
  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const expiresAt = share.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ error: "Share expired" }, { status: 410 });
  }

  const authHeader = request.headers.get("Authorization");
  const access = await verifyShareAccess(shareFirestoreDataToAccessDoc(share as Record<string, unknown>), authHeader);

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.code, message: access.message },
      { status: 403 }
    );
  }

  const ownerId = share.owner_id as string;
  const referencedFileIds = share.referenced_file_ids as string[] | undefined;
  const isVirtualShare = Array.isArray(referencedFileIds) && referencedFileIds.length > 0;

  let fileSnap;
  if (isVirtualShare) {
    fileSnap = await db
      .collection("backup_files")
      .where("userId", "==", ownerId)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    if (!fileSnap.empty && !referencedFileIds.includes(fileSnap.docs[0].id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  } else {
    const linkedDriveId = share.linked_drive_id as string;
    fileSnap = await db
      .collection("backup_files")
      .where("userId", "==", ownerId)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
  }

  if (fileSnap.empty || fileSnap.docs[0].data().deleted_at) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const t0 = Date.now();
  try {
    let backupData: Record<string, unknown> | null = null;
    let fsReads: "none" | "single" = "none";
    if (deliveryUseFirestoreProxyHints()) {
      backupData = fileSnap.docs[0]!.data() as Record<string, unknown>;
      fsReads = "single";
    }
    const proxyKey = getProxyObjectKey(objectKey);
    const { exists: proxyExists, usedHead } = await resolveProxyExistsForBackup(
      objectKey,
      backupData
    );
    if (!proxyExists) {
      const processingPayload = {
        processing: true,
        message: "Generating preview. Check back in a moment.",
        estimatedSeconds: 60,
      };
      logDeliveryTelemetry({
        route: "/api/shares/[token]/video-stream-url",
        durationMs: Date.now() - t0,
        deliveryClass: "processing",
        responseType: "json",
        approxPayloadBytes: JSON.stringify(processingPayload).length,
        headFallback: usedHead,
        surface: "share",
        pollingRequest: readPollingRequestHeader(request),
        firestoreReads: fsReads,
      });
      return NextResponse.json(processingPayload);
    }
    const streamUrl = await getDownloadUrl(proxyKey, STREAM_EXPIRY_SEC);
    const out = NextResponse.json({ streamUrl });
    logDeliveryTelemetry({
      route: "/api/shares/[token]/video-stream-url",
      durationMs: Date.now() - t0,
      deliveryClass: "proxy_mp4",
      responseType: "json",
      approxPayloadBytes: JSON.stringify({ streamUrl }).length,
      headFallback: usedHead,
      surface: "share",
      pollingRequest: readPollingRequestHeader(request),
      firestoreReads: fsReads,
    });
    return out;
  } catch (err) {
    console.error("[share video-stream-url] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create stream URL",
      },
      { status: 500 }
    );
  }
}
