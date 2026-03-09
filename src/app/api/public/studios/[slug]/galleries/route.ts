/**
 * GET /api/public/studios/[slug]/galleries
 * List public galleries for a photographer's branded homepage.
 * No auth required. Returns galleries for the profile with public_slug = slug.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Slug required" }, { status: 400 });
  }

  const db = getAdminFirestore();

  const profilesSnap = await db
    .collection("profiles")
    .where("public_slug", "==", slug.toLowerCase().trim())
    .limit(1)
    .get();

  if (profilesSnap.empty) {
    return NextResponse.json(
      { error: "Studio not found", galleries: [] },
      { status: 404 }
    );
  }

  const photographerId = profilesSnap.docs[0].id;

  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", photographerId)
    .where("access_mode", "==", "public")
    .orderBy("created_at", "desc")
    .get();

  const galleryIds = galleriesSnap.docs.map((d) => d.id);
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
    for (const d of galleriesSnap.docs) {
      const data = d.data();
      const coverId = data.cover_asset_id ?? null;
      const assets = byGallery[d.id] ?? [];
      const first = assets[0];
      const coverAsset = coverId ? assets.find((a) => a.id === coverId) : first;
      if (coverAsset?.object_key) {
        coverMap[d.id] = { object_key: coverAsset.object_key, name: coverAsset.name };
      }
    }
  }

  const galleries = galleriesSnap.docs.map((d) => {
    const data = d.data();
    const cover = coverMap[d.id] ?? null;
    return {
      id: d.id,
      title: data.title,
      slug: data.slug,
      cover_object_key: cover?.object_key ?? null,
      cover_name: cover?.name ?? null,
      description: data.description ?? null,
      event_date: data.event_date ?? null,
      branding: data.branding ?? {},
      created_at: data.created_at?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  const firstGallery = galleries[0];
  const branding = (firstGallery?.branding ?? {}) as { business_name?: string; logo_url?: string };

  return NextResponse.json({
    photographer_id: photographerId,
    business_name: branding.business_name ?? null,
    logo_url: branding.logo_url ?? null,
    galleries,
  });
}
