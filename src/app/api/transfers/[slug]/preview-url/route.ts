import { getDownloadUrl, isB2Configured } from "@/lib/cdn";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifySecret } from "@/lib/gallery-access";
import {
  fetchBackupFileDataForTransferEntry,
  resolvePreviewInlineEffectiveKey,
} from "@/lib/asset-delivery-resolve";
import { deliveryUseFirestoreProxyHints } from "@/lib/delivery-flags";
import {
  logDeliveryTelemetry,
  readPollingRequestHeader,
} from "@/lib/delivery-telemetry";
import { loadTransferFilesForApi, transferIsRecipientVisible } from "@/lib/transfer-resolve";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const objectKey = body.object_key ?? body.objectKey;
  const password = body.password as string | undefined;

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json(
      { error: "object_key is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const transferSnap = await db.collection("transfers").doc(slug).get();

  if (!transferSnap.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const transfer = transferSnap.data();
  if (!transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  if (!transferIsRecipientVisible(transfer as Record<string, unknown>)) {
    return NextResponse.json({ error: "Transfer not available" }, { status: 403 });
  }

  const expiresAt = transfer.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ error: "Transfer expired" }, { status: 410 });
  }

  const status = transfer.status ?? "active";
  if (status !== "active") {
    return NextResponse.json({ error: "Transfer not available" }, { status: 410 });
  }

  const passwordHash = transfer.password_hash ?? null;
  const legacyPassword = transfer.password ?? null;
  const requiresPassword = !!passwordHash || !!legacyPassword;
  if (requiresPassword) {
    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password required or incorrect" },
        { status: 403 }
      );
    }
    if (passwordHash) {
      const ok = await verifySecret(password, passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "Password required or incorrect" },
          { status: 403 }
        );
      }
    } else {
      const a = Buffer.from(password, "utf8");
      const b = Buffer.from(legacyPassword, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json(
          { error: "Password required or incorrect" },
          { status: 403 }
        );
      }
    }
  }

  const files = await loadTransferFilesForApi(
    db,
    slug,
    transfer as Record<string, unknown>
  );
  const fileInTransfer = files.find(
    (f) => f.object_key === objectKey || f.backup_file_id === objectKey
  );

  if (!fileInTransfer) {
    return NextResponse.json(
      { error: "File not found in this transfer" },
      { status: 403 }
    );
  }

  const objKey = fileInTransfer.object_key ?? objectKey;
  if (!objKey) {
    return NextResponse.json(
      { error: "File has no object key" },
      { status: 400 }
    );
  }

  const PREVIEW_URL_EXPIRY = 900; // 15 min

  const t0 = Date.now();
  try {
    let backupData: Record<string, unknown> | null = null;
    let fsReads: "none" | "single" = "none";
    if (deliveryUseFirestoreProxyHints()) {
      backupData = await fetchBackupFileDataForTransferEntry(
        objKey,
        fileInTransfer.backup_file_id ?? undefined
      );
      fsReads = "single";
    }
    const { effectiveKey, usedHead } = await resolvePreviewInlineEffectiveKey(
      objKey,
      backupData
    );
    const url = await getDownloadUrl(effectiveKey, PREVIEW_URL_EXPIRY, undefined, true);
    const res = NextResponse.json({ url });
    logDeliveryTelemetry({
      route: "/api/transfers/[slug]/preview-url",
      durationMs: Date.now() - t0,
      deliveryClass: effectiveKey === objKey ? "source_inline" : "proxy_mp4",
      responseType: "json",
      approxPayloadBytes: JSON.stringify({ url }).length,
      headFallback: usedHead,
      surface: "transfer",
      pollingRequest: readPollingRequestHeader(request),
      firestoreReads: fsReads,
    });
    return res;
  } catch (err) {
    console.error("Transfer preview URL error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create preview URL",
      },
      { status: 500 }
    );
  }
}
