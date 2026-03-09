/**
 * GET /api/profile/share-image-candidates
 * Returns image assets from the user's galleries for use as link preview image.
 * Auth required.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { GALLERY_IMAGE_EXT } from "@/lib/gallery-file-types";
import { NextResponse } from "next/server";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const db = getAdminFirestore();

  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", uid)
    .orderBy("created_at", "desc")
    .limit(50)
    .get();

  const galleryIds = galleriesSnap.docs.map((d) => d.id);
  if (galleryIds.length === 0) {
    return NextResponse.json({ assets: [] });
  }

  const assets: Array<{
    id: string;
    gallery_id: string;
    gallery_title: string;
    name: string;
    object_key: string;
  }> = [];

  for (let i = 0; i < galleryIds.length; i += 10) {
    const batch = galleryIds.slice(i, i + 10);
    const assetsSnap = await db
      .collection("gallery_assets")
      .where("gallery_id", "in", batch)
      .where("is_visible", "==", true)
      .orderBy("sort_order", "asc")
      .get();

    const galleryTitles: Record<string, string> = {};
    for (const d of galleriesSnap.docs) {
      galleryTitles[d.id] = d.data().title ?? "Gallery";
    }

    for (const doc of assetsSnap.docs) {
      const d = doc.data();
      const name = (d.name ?? "") as string;
      if (!GALLERY_IMAGE_EXT.test(name)) continue;
      assets.push({
        id: doc.id,
        gallery_id: d.gallery_id as string,
        gallery_title: galleryTitles[d.gallery_id] ?? "Gallery",
        name,
        object_key: d.object_key as string,
      });
    }
  }

  return NextResponse.json({
    assets: assets.slice(0, 100),
  });
}
