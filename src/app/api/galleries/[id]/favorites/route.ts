/**
 * Favorites API for gallery proofing
 * POST: Create/save a favorites list (client)
 * GET: List favorites for gallery (photographer sees all; client can filter by email)
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";

/** POST – Create a favorites list (client, no auth required for public galleries) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const { client_email: clientEmail, client_name: clientName, asset_ids: assetIds } = body;

  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return NextResponse.json(
      { error: "asset_ids array with at least one ID is required" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  const url = new URL(request.url);
  const password = url.searchParams.get("password") ?? undefined;

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

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
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const validIds = assetIds.filter(
    (id: unknown): id is string => typeof id === "string" && id.length > 0
  );
  const uniqueIds = [...new Set(validIds)];

  const now = new Date();
  const listRef = await db.collection("favorites_lists").add({
    gallery_id: galleryId,
    client_email: typeof clientEmail === "string" ? clientEmail.trim() || null : null,
    client_name: typeof clientName === "string" ? clientName.trim() || null : null,
    asset_ids: uniqueIds,
    created_at: now,
    updated_at: now,
  });

  const currentFav = g.favorite_count ?? 0;
  const addedCount = uniqueIds.length;
  await db.collection("galleries").doc(galleryId).update({
    favorite_count: currentFav + addedCount,
    updated_at: now,
  });

  return NextResponse.json({
    id: listRef.id,
    asset_ids: uniqueIds,
    created_at: now.toISOString(),
  });
}

/** GET – List favorites for gallery. Photographer: all. Client: filter by email. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const url = new URL(request.url);
  const clientEmail = url.searchParams.get("client_email") ?? undefined;
  const authHeader = request.headers.get("Authorization");
  const password = url.searchParams.get("password") ?? undefined;

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

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
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let snap;
  if (clientEmail) {
    const email = clientEmail.toLowerCase().trim();
    snap = await db
      .collection("favorites_lists")
      .where("gallery_id", "==", galleryId)
      .where("client_email", "==", email)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();
  } else {
    snap = await db
      .collection("favorites_lists")
      .where("gallery_id", "==", galleryId)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();
  }

  const lists = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      gallery_id: data.gallery_id,
      client_email: data.client_email ?? null,
      client_name: data.client_name ?? null,
      asset_ids: data.asset_ids ?? [],
      created_at: data.created_at?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  return NextResponse.json({ lists });
}
