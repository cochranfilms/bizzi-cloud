/**
 * PATCH /api/galleries/[id]/assets/[assetId]
 * Update gallery asset (photographer only) – e.g. proofing_status
 *
 * DELETE — remove asset from gallery; deletes backup_files row and B2 objects when no other gallery asset references that file.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { deleteGalleryAssetAndStorage } from "@/lib/delete-gallery-asset";
import { NextResponse } from "next/server";

const VALID_PROOFING_STATUSES = ["pending", "selected", "editing", "delivered"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { id: galleryId, assetId } = await params;
  if (!galleryId || !assetId) {
    return NextResponse.json({ error: "Gallery ID and asset ID required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { proofing_status: proofingStatus, is_visible: isVisible, is_hero: isHero } = body;

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  if (gallerySnap.data()!.photographer_id !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const assetRef = db.collection("gallery_assets").doc(assetId);
  const assetSnap = await assetRef.get();
  if (!assetSnap.exists || assetSnap.data()?.gallery_id !== galleryId) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (
    proofingStatus &&
    VALID_PROOFING_STATUSES.includes(proofingStatus as (typeof VALID_PROOFING_STATUSES)[number])
  ) {
    updates.proofing_status = proofingStatus;
  }
  if (typeof isVisible === "boolean") updates.is_visible = isVisible;
  if (typeof isHero === "boolean") updates.is_hero = isHero;

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ ok: true });
  }

  await assetRef.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { id: galleryId, assetId } = await params;
  if (!galleryId || !assetId) {
    return NextResponse.json({ error: "Gallery ID and asset ID required" }, { status: 400 });
  }

  const result = await deleteGalleryAssetAndStorage({
    galleryId,
    assetId,
    ownerUid: uid,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    backup_file_deleted: result.backup_file_deleted,
    b2_deleted: result.b2_deleted,
  });
}
