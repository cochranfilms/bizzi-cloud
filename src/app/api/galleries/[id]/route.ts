import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { hashSecret } from "@/lib/gallery-access";
import { slugify, ensureUniqueSlugInTransaction } from "@/lib/gallery-slug";
import type { UpdateGalleryInput } from "@/types/gallery";
import {
  isValidMediaMode,
  legacySourceFormatFromMediaMode,
  normalizeGalleryMediaMode,
} from "@/lib/gallery-media-mode";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";
import {
  applyMacosPackageDelta,
  mergeMacosPackageTrashDeltasInto,
} from "@/lib/macos-package-container-admin";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

/** GET /api/galleries/[id] – get gallery (owner only) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;
  const { id } = await params;

  if (!id) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const db = getAdminFirestore();
  const snap = await db.collection("galleries").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const data = snap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, data))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let owner_handle: string | null = null;
  const slugUid =
    typeof data.photographer_id === "string" && data.photographer_id
      ? data.photographer_id
      : uid;
  const profileSnap = await db.collection("profiles").doc(slugUid).get();
  owner_handle = (profileSnap.data()?.public_slug as string) ?? null;

  const version = typeof data.version === "number" ? data.version : 1;
  const media_mode = normalizeGalleryMediaMode({
    media_mode: data.media_mode as string | null | undefined,
    source_format: data.source_format as string | null | undefined,
  });

  return NextResponse.json({
    id: snap.id,
    ...data,
    media_mode,
    owner_handle,
    version,
    created_at: data.created_at?.toDate?.()?.toISOString?.(),
    updated_at: data.updated_at?.toDate?.()?.toISOString?.(),
  });
}

/** PATCH /api/galleries/[id] – update gallery (optimistic locking via version) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;
  const { id } = await params;

  if (!id) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as UpdateGalleryInput;
  const requestedVersion = typeof body.version === "number" ? body.version : undefined;
  if (requestedVersion === undefined) {
    return NextResponse.json(
      { error: "Version required for optimistic locking; refetch gallery and retry" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection("galleries").doc(id);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 404 as const };
    const data = snap.data()!;
    if (!(await userCanManageGalleryAsPhotographer(uid, data))) return { status: 403 as const };
    const currentVersion = typeof data.version === "number" ? data.version : 1;
    if (currentVersion !== requestedVersion) {
      return { status: 409 as const };
    }

    const updates: Record<string, unknown> = {};
    const now = new Date();

    if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.cover_asset_id !== undefined) updates.cover_asset_id = body.cover_asset_id ?? null;
  if (body.share_image_asset_id !== undefined)
    updates.share_image_asset_id = body.share_image_asset_id ?? null;
  if (body.cover_position !== undefined) updates.cover_position = body.cover_position ?? null;
  if (body.cover_focal_x !== undefined) updates.cover_focal_x = body.cover_focal_x ?? null;
  if (body.cover_focal_y !== undefined) updates.cover_focal_y = body.cover_focal_y ?? null;
  if (body.cover_alt_text !== undefined) updates.cover_alt_text = body.cover_alt_text?.trim() ?? null;
  if (body.cover_overlay_opacity !== undefined) updates.cover_overlay_opacity = body.cover_overlay_opacity ?? null;
  if (body.cover_title_alignment !== undefined) updates.cover_title_alignment = body.cover_title_alignment ?? null;
  if (body.cover_hero_height !== undefined) updates.cover_hero_height = body.cover_hero_height ?? null;
  if (body.description !== undefined) updates.description = body.description?.trim() ?? null;
  if (body.event_date !== undefined) updates.event_date = body.event_date ?? null;
  if (body.expiration_date !== undefined) updates.expiration_date = body.expiration_date ?? null;
  if (body.access_mode !== undefined) updates.access_mode = body.access_mode;
  if (Array.isArray(body.invited_emails)) {
    const newInvited = body.invited_emails
      .filter((e): e is string => typeof e === "string")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    updates.invited_emails = newInvited;
    // Sync invite_sent_to: keep only emails still in invited_emails
    const currentSentTo = (data.invite_sent_to ?? []) as string[];
    const newInvitedSet = new Set(newInvited.map((e) => e.toLowerCase()));
    const keepSentTo = currentSentTo.filter((e) => newInvitedSet.has(e.toLowerCase()));
    if (JSON.stringify([...keepSentTo].sort()) !== JSON.stringify([...currentSentTo].sort())) {
      updates.invite_sent_to = keepSentTo;
    }
  }
  if (body.layout !== undefined) updates.layout = body.layout;
  if (body.media_mode !== undefined) {
    if (!isValidMediaMode(body.media_mode)) {
      return { status: 400 as const, error: "Invalid media_mode" };
    }
    updates.media_mode = body.media_mode;
    updates.source_format = legacySourceFormatFromMediaMode(body.media_mode);
  } else if (body.source_format !== undefined) {
    const sf = body.source_format === "raw" ? "raw" : "jpg";
    updates.source_format = sf;
    updates.media_mode = sf === "raw" ? "raw" : "final";
  }
  if (body.branding !== undefined) {
    updates.branding = { ...data.branding, ...body.branding };
  }
  if (body.download_settings !== undefined) {
    updates.download_settings = { ...data.download_settings, ...body.download_settings };
  }
  if (body.watermark !== undefined) {
    updates.watermark = { ...data.watermark, ...body.watermark };
  }
  if (body.lut !== undefined) {
    updates.lut = { ...data.lut, ...body.lut };
  }
  // Video gallery specific fields
  if (body.delivery_mode !== undefined) updates.delivery_mode = body.delivery_mode ?? null;
  if (body.download_policy !== undefined) updates.download_policy = body.download_policy ?? null;
  if (body.allow_comments !== undefined) updates.allow_comments = body.allow_comments;
  if (body.allow_favorites !== undefined) updates.allow_favorites = body.allow_favorites;
  if (body.allow_timestamp_comments !== undefined) updates.allow_timestamp_comments = body.allow_timestamp_comments;
  if (body.allow_original_downloads !== undefined) updates.allow_original_downloads = body.allow_original_downloads;
  if (body.allow_proxy_downloads !== undefined) updates.allow_proxy_downloads = body.allow_proxy_downloads;
  if (body.revision_limit_enabled !== undefined) updates.revision_limit_enabled = body.revision_limit_enabled;
  if (body.revision_limit_count !== undefined) updates.revision_limit_count = body.revision_limit_count ?? null;
  if (body.invoice_mode !== undefined) updates.invoice_mode = body.invoice_mode ?? null;
  if (body.invoice_url !== undefined) updates.invoice_url = body.invoice_url ?? null;
  if (body.invoice_label !== undefined) updates.invoice_label = body.invoice_label ?? null;
  if (body.invoice_status !== undefined) updates.invoice_status = body.invoice_status ?? null;
  if (body.invoice_required_for_download !== undefined) updates.invoice_required_for_download = body.invoice_required_for_download;
  if (body.featured_video_asset_id !== undefined) updates.featured_video_asset_id = body.featured_video_asset_id ?? null;
  if (body.client_review_instructions !== undefined) updates.client_review_instructions = body.client_review_instructions?.trim() ?? null;
  if (body.workflow_status !== undefined) updates.workflow_status = body.workflow_status ?? null;

  if (body.access_mode === "password" && body.password) {
    updates.password_hash = await hashSecret(body.password);
  }
  if (body.access_mode !== undefined && body.access_mode !== "pin") {
    updates.pin_hash = null;
  }

  if (body.title && body.title !== data.title) {
    const baseSlug = slugify(body.title.trim());
    const slugPhotographerId =
      typeof data.photographer_id === "string" && data.photographer_id ? data.photographer_id : uid;
    updates.slug = await ensureUniqueSlugInTransaction(tx, db, slugPhotographerId, baseSlug, id);
  }

  if (Object.keys(updates).length === 0) {
    return { status: 200 as const, ok: true };
  }

  updates.updated_at = now;
  updates.version = currentVersion + 1;
  tx.update(ref, updates);

  return { status: 200 as const, ok: true };
  });

  if (result.status === 404) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  if (result.status === 403) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (result.status === 400) {
    return NextResponse.json({ error: "Invalid media_mode" }, { status: 400 });
  }
  if (result.status === 409) {
    return NextResponse.json(
      { error: "Document was modified by another user; refetch and try again" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/galleries/[id]
 * Query: ?deleteFiles=true – also soft-delete backup_files linked via gallery_assets
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;
  const { id } = await params;

  if (!id) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const url = new URL(request.url);
  const deleteFiles = url.searchParams.get("deleteFiles") === "true";

  const db = getAdminFirestore();
  const ref = db.collection("galleries").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const galleryData = snap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, galleryData))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const assetsSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", id)
    .get();

  if (deleteFiles && !assetsSnap.empty) {
    const backupFileIds = assetsSnap.docs
      .map((d) => d.data().backup_file_id as string)
      .filter(Boolean);
    const uniqueIds = [...new Set(backupFileIds)];

    const pkgDeltas = new Map<string, { count: number; bytes: number }>();
    let batch = db.batch();
    let batchCount = 0;

    for (const fileId of uniqueIds) {
      const fileRef = db.collection("backup_files").doc(fileId);
      const fileSnap = await fileRef.get();
      if (!fileSnap.exists || fileSnap.data()!.userId !== uid) continue;
      const fd = fileSnap.data()!;
      if (fd.deleted_at) continue;
      mergeMacosPackageTrashDeltasInto(pkgDeltas, fd);
      batch.update(fileRef, { deleted_at: FieldValue.serverTimestamp() });
      batchCount++;
      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }
    if (pkgDeltas.size > 0) {
      await applyMacosPackageDelta(db, pkgDeltas);
    }
  }

  for (const doc of assetsSnap.docs) {
    await doc.ref.delete();
  }

  await ref.delete();

  return NextResponse.json({ ok: true });
}
