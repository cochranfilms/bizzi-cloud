/**
 * GET /api/galleries/[id]/favorites/[listId]
 * Fetch a single favorites list for viewing/sharing.
 * Requires gallery access (password in query, or auth for invite-only).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  const { id: galleryId, listId } = await params;
  if (!galleryId || !listId) {
    return NextResponse.json({ error: "Gallery ID and list ID required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const password = url.searchParams.get("password") ?? undefined;
  const authHeader = request.headers.get("Authorization");

  const db = getAdminFirestore();

  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
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
    { authHeader, password }
  );

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.code, message: access.message, needsPassword: access.needsPassword },
      { status: 403 }
    );
  }

  const listSnap = await db.collection("favorites_lists").doc(listId).get();
  if (!listSnap.exists) {
    return NextResponse.json({ error: "Favorites list not found" }, { status: 404 });
  }

  const listData = listSnap.data()!;
  if (listData.gallery_id !== galleryId) {
    return NextResponse.json({ error: "Favorites list not found" }, { status: 404 });
  }

  const assetIds = listData.asset_ids ?? [];
  const idToAsset: Record<string, { id: string; name: string; object_key: string; media_type: string }> = {};

  if (assetIds.length > 0) {
    for (let i = 0; i < assetIds.length; i += 30) {
      const chunk = assetIds.slice(i, i + 30);
      const refs = chunk.map((id: string) => db.collection("gallery_assets").doc(id));
      const snaps = await db.getAll(...refs);
      for (const d of snaps) {
        if (!d.exists) continue;
        const a = d.data()!;
        if (a.gallery_id !== galleryId) continue;
        idToAsset[d.id] = {
          id: d.id,
          name: a.name ?? "",
          object_key: a.object_key,
          media_type: a.media_type ?? "image",
        };
      }
    }
  }

  type AssetRecord = { id: string; name: string; object_key: string; media_type: string };
  const assets = assetIds
    .map((id: string) => idToAsset[id])
    .filter((a: AssetRecord | undefined): a is AssetRecord => !!a);

  return NextResponse.json({
    list: {
      id: listSnap.id,
      gallery_id: galleryId,
      client_email: listData.client_email ?? null,
      client_name: listData.client_name ?? null,
      asset_ids: assetIds,
      created_at: listData.created_at?.toDate?.()?.toISOString?.() ?? null,
    },
    gallery: {
      id: gallerySnap.id,
      title: g.title,
      branding: g.branding ?? {},
      download_settings: g.download_settings ?? {},
    },
    assets,
  });
}
