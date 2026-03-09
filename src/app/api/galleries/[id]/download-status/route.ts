/**
 * GET /api/galleries/[id]/download-status
 * Returns the current client's download count and limit for this gallery.
 * Used to display "X of Y downloads remaining" in the client UI.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { getGalleryDownloadClientId, getDownloadCount } from "@/lib/gallery-download-tracking";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

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
      { error: access.code, message: access.message },
      { status: 403 }
    );
  }

  const freeLimit = (g.download_settings ?? {}).free_download_limit;

  if (typeof freeLimit !== "number" || freeLimit < 0) {
    return NextResponse.json({ limit: null, used: 0, remaining: null });
  }

  let isOwner = false;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await verifyIdToken(authHeader.slice(7).trim());
      if (decoded.uid === g.photographer_id) isOwner = true;
    } catch {
      // not owner
    }
  }

  if (isOwner) {
    return NextResponse.json({ limit: freeLimit, used: 0, remaining: freeLimit });
  }

  const clientId = getGalleryDownloadClientId(request);
  const used = await getDownloadCount(db, galleryId, clientId);
  const remaining = Math.max(0, freeLimit - used);

  return NextResponse.json({
    limit: freeLimit,
    used,
    remaining,
  });
}
