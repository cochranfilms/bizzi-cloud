/**
 * GET /api/client/galleries
 * List galleries the signed-in client has access to (invited_emails contains their email).
 * Requires Firebase Auth.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

function requireAuth(request: Request): Promise<{ uid: string; email: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return Promise.resolve(
      NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 })
    );
  }
  return verifyIdToken(token)
    .then((decoded) => {
      const email = decoded.email as string | undefined;
      if (!email) {
        return NextResponse.json(
          { error: "Account has no email" },
          { status: 400 }
        ) as unknown as NextResponse;
      }
      return { uid: decoded.uid, email: email.toLowerCase().trim() };
    })
    .catch(() =>
      NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
    );
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { email } = auth;

  const db = getAdminFirestore();

  // Query galleries where invited_emails contains this email.
  // Note: Firestore array-contains is case-sensitive; we use lowercase for consistency.
  // Photographers should add emails in lowercase, or we'd need a normalized index.
  const snap = await db
    .collection("galleries")
    .where("invited_emails", "array-contains", email)
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
      if (coverAsset?.object_key) {
        coverMap[d.id] = { object_key: coverAsset.object_key, name: coverAsset.name };
      }
    }
  }

  // Sort by created_at desc (in memory; avoids composite index for array-contains + orderBy)
  const galleries = snap.docs
    .map((d) => {
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
    })
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({ galleries });
}
