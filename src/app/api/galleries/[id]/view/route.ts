/**
 * GET /api/galleries/[id]/view
 * Public gallery view – returns gallery metadata + assets for client display.
 * Access: public, password, or invite_only.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import {
  buildValidViewerLutIdSet,
  normalizeStoredViewerLutPreferences,
} from "@/lib/gallery-viewer-lut-persist-server";
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

  // Increment view count atomically (fire and forget, don't block response)
  db.collection("galleries").doc(id).update({
    view_count: FieldValue.increment(1),
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
      duration: a.duration ?? null,
      is_downloadable: a.is_downloadable ?? null,
    };
  });

  const galleryType = g.gallery_type === "video" ? "video" : "photo";
  const mediaMode = normalizeGalleryMediaMode({
    media_mode: g.media_mode as string | null | undefined,
    source_format: g.source_format as string | null | undefined,
  });
  const creativeConfig = g.creative_lut_config ?? null;
  const rawLibrary = (g.creative_lut_library ?? []) as Array<{
    id: string;
    name?: string;
    mode?: string;
    file_type?: string;
    storage_path?: string | null;
    signed_url?: string | null;
  }>;
  const legacyLut = g.lut ?? null;

  // Use same-origin proxy URLs for custom LUTs (avoids CORS). Client appends &password= when needed.
  const creativeLibrary = rawLibrary.map((e) => {
    const isCustomStored =
      !!e.storage_path &&
      !!e.id &&
      e.mode !== "builtin" &&
      (e.mode === "custom" || e.mode == null);
    if (isCustomStored) {
      const lutFormat = e.file_type === "3dl" ? "3dl" : "cube";
      return {
        ...e,
        signed_url: `/api/galleries/${id}/lut-file?entry_id=${encodeURIComponent(e.id)}&lut_format=${lutFormat}`,
      };
    }
    return e;
  });

  let lut: { enabled: boolean; lut_source: string | null; storage_url?: string | null } | null = null;
  const config = creativeConfig ?? {};
  const coerceBool = (v: unknown): boolean | undefined => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const l = v.trim().toLowerCase();
      if (l === "true") return true;
      if (l === "false") return false;
    }
    return undefined;
  };
  const enabled =
    coerceBool(config.enabled) ?? coerceBool(legacyLut?.enabled) ?? false;
  const selectedId = config.selected_lut_id ?? null;

  if (enabled) {
    let lutSource: string | null = null;
    if (selectedId === "sony_rec709") {
      lutSource = "sony_rec709";
    } else if (selectedId) {
      const entry = creativeLibrary.find((e) => e.id === selectedId);
      lutSource = entry?.signed_url ?? null;
    }
    if (!lutSource && legacyLut?.storage_url) lutSource = legacyLut.storage_url;
    lut = { enabled: true, lut_source: lutSource, storage_url: lutSource };
  }

  const viewer_lut_preferences =
    mediaMode === "raw"
      ? normalizeStoredViewerLutPreferences(
          g.viewer_lut_preferences,
          buildValidViewerLutIdSet(rawLibrary, galleryType)
        )
      : null;

  return NextResponse.json({
    gallery: {
      id: gallerySnap.id,
      gallery_type: galleryType,
      media_mode: mediaMode,
      source_format: (g.source_format as string | null | undefined) ?? null,
      title: g.title,
      slug: g.slug,
      description: g.description ?? null,
      event_date: g.event_date ?? null,
      layout: g.layout ?? "masonry",
      branding: g.branding ?? {},
      download_settings: g.download_settings ?? {},
      watermark: g.watermark ?? {},
      lut,
      creative_lut_config: creativeConfig,
      creative_lut_library: creativeLibrary,
      cover_asset_id: g.cover_asset_id ?? null,
      share_image_asset_id: g.share_image_asset_id ?? null,
      cover_position: g.cover_position ?? "center",
      cover_focal_x: g.cover_focal_x ?? null,
      cover_focal_y: g.cover_focal_y ?? null,
      cover_alt_text: g.cover_alt_text ?? null,
      cover_overlay_opacity: g.cover_overlay_opacity ?? null,
      cover_title_alignment: g.cover_title_alignment ?? null,
      cover_hero_height: g.cover_hero_height ?? null,
      // Video gallery specific – present for all, meaningful for video
      featured_video_asset_id: g.featured_video_asset_id ?? null,
      delivery_mode: g.delivery_mode ?? null,
      download_policy: g.download_policy ?? null,
      allow_comments: g.allow_comments ?? true,
      allow_favorites: g.allow_favorites ?? true,
      allow_timestamp_comments: g.allow_timestamp_comments ?? false,
      invoice_required_for_download: g.invoice_required_for_download ?? false,
      invoice_url: g.invoice_url ?? null,
      invoice_label: g.invoice_label ?? null,
      invoice_status: g.invoice_status ?? "none",
      client_review_instructions: g.client_review_instructions ?? null,
      workflow_status: g.workflow_status ?? null,
      revision_limit_enabled: g.revision_limit_enabled ?? false,
      revision_limit_count: g.revision_limit_count ?? null,
      viewer_lut_preferences,
    },
    collections,
    assets,
  });
}
