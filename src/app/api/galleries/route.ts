import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { hashSecret } from "@/lib/gallery-access";
import { slugify, ensureUniqueSlug } from "@/lib/gallery-slug";
import {
  DEFAULT_BRANDING,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_WATERMARK,
} from "@/lib/gallery-defaults";
import type { CreateGalleryInput, GalleryAccessMode } from "@/types/gallery";
import { NextResponse } from "next/server";

function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return Promise.resolve(
      NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 })
    );
  }
  return verifyIdToken(token)
    .then((decoded) => ({ uid: decoded.uid }))
    .catch(() =>
      NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
    );
}

/** GET /api/galleries – list photographer's galleries */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const db = getAdminFirestore();
  const snap = await db
    .collection("galleries")
    .where("photographer_id", "==", uid)
    .orderBy("created_at", "desc")
    .get();

  const galleryIds = snap.docs.map((d) => d.id);
  let coverMap: Record<string, { object_key: string; name: string }> = {};
  if (galleryIds.length > 0) {
    const byGallery: Record<string, Array<{ id: string; object_key: string; name: string }>> = {};
    for (let i = 0; i < galleryIds.length; i += 10) {
      const batch = galleryIds.slice(i, i + 10);
      const assetsSnap = await db
        .collection("gallery_assets")
        .where("gallery_id", "in", batch)
        .where("is_visible", "==", true)
        .orderBy("sort_order", "asc")
        .get();
      for (const doc of assetsSnap.docs) {
        const d = doc.data();
        const gid = d.gallery_id;
        if (!byGallery[gid]) byGallery[gid] = [];
        byGallery[gid].push({
          id: doc.id,
          object_key: d.object_key,
          name: d.name ?? "",
        });
      }
    }
    for (const d of snap.docs) {
      const data = d.data();
      const coverId = data.cover_asset_id ?? null;
      const assets = byGallery[d.id] ?? [];
      const first = assets[0];
      const coverAsset = coverId ? assets.find((a) => a.id === coverId) : first;
      if (coverAsset?.object_key) coverMap[d.id] = { object_key: coverAsset.object_key, name: coverAsset.name };
    }
  }

  const galleries = snap.docs.map((d) => {
    const data = d.data();
    const cover = coverMap[d.id] ?? null;
    return {
      id: d.id,
      title: data.title,
      slug: data.slug,
      photographer_id: data.photographer_id,
      cover_asset_id: data.cover_asset_id ?? null,
      cover_object_key: cover?.object_key ?? null,
      cover_name: cover?.name ?? null,
      description: data.description ?? null,
      event_date: data.event_date ?? null,
      expiration_date: data.expiration_date ?? null,
      access_mode: data.access_mode ?? "public",
      layout: data.layout ?? "masonry",
      view_count: data.view_count ?? 0,
      unique_visitor_count: data.unique_visitor_count ?? 0,
      favorite_count: data.favorite_count ?? 0,
      download_count: data.download_count ?? 0,
      created_at: data.created_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      updated_at: data.updated_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    };
  });

  return NextResponse.json({ galleries });
}

/** POST /api/galleries – create gallery */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const body = (await request.json().catch(() => ({}))) as CreateGalleryInput;
  const {
    title,
    description,
    event_date,
    expiration_date,
    access_mode = "public",
    password,
    invited_emails,
    layout = "masonry",
    source_format = "jpg",
    branding,
    download_settings,
    watermark,
  } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const baseSlug = slugify(title.trim());
  const slug = await ensureUniqueSlug(db, uid, baseSlug);

  let passwordHash: string | null = null;

  if (access_mode === "password" && password && typeof password === "string") {
    passwordHash = await hashSecret(password);
  }

  const now = new Date();
  const galleryData = {
    title: title.trim(),
    slug,
    photographer_id: uid,
    cover_asset_id: null,
    description: description?.trim() ?? null,
    event_date: event_date ?? null,
    expiration_date: expiration_date ?? null,
    password_hash: passwordHash,
    pin_hash: null,
    access_mode: access_mode as GalleryAccessMode,
    invited_emails: Array.isArray(invited_emails)
      ? invited_emails
          .filter((e): e is string => typeof e === "string")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      : [],
    branding: { ...DEFAULT_BRANDING, ...branding },
    layout,
    source_format: source_format === "raw" ? "raw" : "jpg",
    download_settings: { ...DEFAULT_DOWNLOAD_SETTINGS, ...download_settings },
    watermark: { ...DEFAULT_WATERMARK, ...watermark },
    view_count: 0,
    unique_visitor_count: 0,
    favorite_count: 0,
    download_count: 0,
    created_at: now,
    updated_at: now,
  };

  const ref = await db.collection("galleries").add(galleryData);

  return NextResponse.json({
    id: ref.id,
    gallery_url: `/g/${ref.id}`,
    ...galleryData,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}
