/**
 * GET /api/galleries/[id]/view
 * Public gallery view – returns gallery metadata + assets for client display.
 * Access: public, password, or invite_only.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const url = new URL(request.url);
  const password = url.searchParams.get("password") ?? undefined;
  const authHeader = request.headers.get("Authorization");
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(id).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const g = gallerySnap.data()!;
  const access = await verifyGalleryViewAccess(
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

  // Increment view count (fire and forget, don't block response)
  db.collection("galleries").doc(id).update({
    view_count: (g.view_count ?? 0) + 1,
    updated_at: new Date(),
  }).catch(() => {});

  const assetsSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", id)
    .where("is_visible", "==", true)
    .orderBy("sort_order", "asc")
    .get();

  const collectionsSnap = await db
    .collection("gallery_collections")
    .where("gallery_id", "==", id)
    .orderBy("sort_order", "asc")
    .get();

  const collections = collectionsSnap.docs.map((d) => {
    const c = d.data();
    return {
      id: d.id,
      gallery_id: c.gallery_id,
      title: c.title,
      sort_order: c.sort_order ?? 0,
    };
  });

  const assets = assetsSnap.docs.map((d) => {
    const a = d.data();
    return {
      id: d.id,
      name: a.name,
      media_type: a.media_type ?? "image",
      object_key: a.object_key,
      collection_id: a.collection_id ?? null,
      sort_order: a.sort_order ?? 0,
      proofing_status: a.proofing_status ?? "pending",
    };
  });

  const lut = g.lut ?? null;
  return NextResponse.json({
    gallery: {
      id: gallerySnap.id,
      title: g.title,
      slug: g.slug,
      description: g.description ?? null,
      event_date: g.event_date ?? null,
      layout: g.layout ?? "masonry",
      branding: g.branding ?? {},
      download_settings: g.download_settings ?? {},
      watermark: g.watermark ?? {},
      lut: lut
        ? { enabled: lut.enabled ?? false, storage_url: lut.storage_url ?? null }
        : null,
      cover_asset_id: g.cover_asset_id ?? null,
      share_image_asset_id: g.share_image_asset_id ?? null,
      cover_position: g.cover_position ?? "center",
      cover_focal_x: g.cover_focal_x ?? null,
      cover_focal_y: g.cover_focal_y ?? null,
      cover_alt_text: g.cover_alt_text ?? null,
      cover_overlay_opacity: g.cover_overlay_opacity ?? null,
      cover_title_alignment: g.cover_title_alignment ?? null,
      cover_hero_height: g.cover_hero_height ?? null,
    },
    collections,
    assets,
  });
}
