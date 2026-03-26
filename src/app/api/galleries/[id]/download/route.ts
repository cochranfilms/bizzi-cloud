/**
 * POST /api/galleries/[id]/download
 * Body: { object_key, name, password?, pin? }
 * Returns presigned download URL. Verifies gallery download access (including PIN).
 * Enforces download_settings: allow_single_download, free_download_limit.
 */
import { createPresignedDownloadUrl, isB2Configured } from "@/lib/b2";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { verifyGalleryDownloadAccess } from "@/lib/gallery-access";
import { getClientEmailFromCookie } from "@/lib/client-session";
import {
  getGalleryDownloadClientId,
  checkAndIncrementDownloadCount,
} from "@/lib/gallery-download-tracking";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";

export async function POST(
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

  const body = await request.json().catch(() => ({}));
  const objectKey = body.object_key ?? body.objectKey;
  const name = body.name ?? body.fileName ?? "download";
  const password = body.password ?? null;
  const downloadContext = (body.download_context as "single" | "full" | "selected") ?? "single";

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key is required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const g = gallerySnap.data()!;
  const access = await verifyGalleryDownloadAccess(
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

  // Owner bypasses download_settings
  let isOwner = false;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await verifyIdToken(authHeader.slice(7).trim());
      isOwner = await userCanManageGalleryAsPhotographer(decoded.uid, g);
    } catch {
      // not owner
    }
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

  const galleryType = g.gallery_type === "video" ? "video" : "photo";

  if (!isOwner) {
    // Video gallery: invoice gating and download_policy
    if (galleryType === "video") {
      const invoiceRequired = g.invoice_required_for_download === true;
      const invoiceStatus = g.invoice_status ?? "none";
      if (invoiceRequired && invoiceStatus !== "paid") {
        return NextResponse.json(
          {
            error: "invoice_required",
            message: "Payment is required before downloads are available.",
            invoice_url: g.invoice_url ?? null,
          },
          { status: 403 }
        );
      }
      const downloadPolicy = g.download_policy ?? "none";
      if (downloadPolicy === "none") {
        return NextResponse.json(
          { error: "download_disabled", message: "Downloads are not enabled for this video gallery." },
          { status: 403 }
        );
      }
      if (downloadPolicy === "selected_assets") {
        const assetData = assetSnap.docs[0]?.data();
        const isDownloadable = assetData?.is_downloadable === true;
        if (!isDownloadable) {
          return NextResponse.json(
            { error: "download_disabled", message: "This asset is not available for download." },
            { status: 403 }
          );
        }
      }
    }

    const downloadSettings = g.download_settings ?? {};
    if (downloadContext === "single" && !downloadSettings.allow_single_download) {
      return NextResponse.json(
        { error: "download_disabled", message: "Single download is not allowed for this gallery." },
        { status: 403 }
      );
    }
    if (downloadContext === "full" && !downloadSettings.allow_full_gallery_download) {
      return NextResponse.json(
        { error: "download_disabled", message: "Full gallery download is not allowed for this gallery." },
        { status: 403 }
      );
    }
    if (downloadContext === "selected" && !downloadSettings.allow_selected_download) {
      return NextResponse.json(
        { error: "download_disabled", message: "Selected favorites download is not allowed for this gallery." },
        { status: 403 }
      );
    }
  }

  // Free download limit (after asset verified - only count successful downloads)
  if (!isOwner) {
    const freeLimit = (g.download_settings ?? {}).free_download_limit;
    if (typeof freeLimit === "number" && freeLimit >= 0) {
      const clientId = getGalleryDownloadClientId(request);
      const { allowed, used } = await checkAndIncrementDownloadCount(
        db,
        galleryId,
        clientId,
        freeLimit
      );
      if (!allowed) {
        return NextResponse.json(
          {
            error: "download_limit_reached",
            message: `You've reached the free download limit (${freeLimit}) for this gallery.`,
            used,
            limit: freeLimit,
          },
          { status: 403 }
        );
      }
    }
  }

  try {
    const url = await createPresignedDownloadUrl(objectKey, 3600, name);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[gallery download] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create download URL" },
      { status: 500 }
    );
  }
}
