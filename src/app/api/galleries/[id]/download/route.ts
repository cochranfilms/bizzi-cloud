/**
 * POST /api/galleries/[id]/download
 * Body: { object_key, name, password?, pin? }
 * Returns presigned download URL. Verifies gallery download access (including PIN).
 */
import { createPresignedDownloadUrl, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyGalleryDownloadAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";

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
  const pin = body.pin ?? null;

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key is required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");

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
    { authHeader, password, pin }
  );

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.code, message: access.message, needsPin: access.needsPin },
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
