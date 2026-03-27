/**
 * PATCH /api/galleries/[id]/assets/[assetId]
 * Update gallery asset (photographer only) – e.g. proofing_status
 *
 * DELETE — remove gallery asset. Body optional: { storage_action?: "detach" | "purge" }.
 * purge (default): historical behavior — may delete backup_files + B2 when origin is gallery_storage and no ref remains.
 * detach: remove gallery row + clear gallery_id on backup only; never B2 purge.
 * purge (gallery_storage): enqueues deletion_jobs with gallery_rich variant; response may include purge_job_id (physical delete is async).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  deleteGalleryAssetAndStorage,
  type GalleryAssetStorageAction,
} from "@/lib/delete-gallery-asset";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";
import {
  createNotification,
  getActorDisplayName,
  resolveEmailsToUserIds,
} from "@/lib/notification-service";

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
  if (!(await userCanManageGalleryAsPhotographer(uid, gallerySnap.data()!))) {
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

  if (
    proofingStatus &&
    VALID_PROOFING_STATUSES.includes(proofingStatus as (typeof VALID_PROOFING_STATUSES)[number])
  ) {
    const g = gallerySnap.data()!;
    const invited = (g.invited_emails as string[]) ?? [];
    const galleryTitle = (g.title as string) ?? "Gallery";
    const photographerLabel = await getActorDisplayName(db, uid);
    const recipientUids = await resolveEmailsToUserIds(invited, uid);
    await Promise.all(
      recipientUids.map((rid) =>
        createNotification({
          recipientUserId: rid,
          actorUserId: uid,
          type: "gallery_proofing_status_updated",
          metadata: {
            actorDisplayName: photographerLabel,
            galleryId,
            galleryTitle,
            proofingStatus: proofingStatus as string,
          },
        }).catch((err) => console.error("[gallery asset PATCH] notify:", err))
      )
    );
  }

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

  const body = await request.json().catch(() => ({}));
  const rawAction = (body as { storage_action?: string }).storage_action;
  const storageAction: GalleryAssetStorageAction =
    rawAction === "detach" ? "detach_metadata" : "purge_unreferenced_backing";

  const result = await deleteGalleryAssetAndStorage({
    galleryId,
    assetId,
    ownerUid: uid,
    storageAction,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    backup_file_deleted: result.backup_file_deleted,
    b2_deleted: result.b2_deleted,
    storage_action: result.storage_action,
    ...(result.purge_job_id != null ? { purge_job_id: result.purge_job_id } : {}),
  });
}
