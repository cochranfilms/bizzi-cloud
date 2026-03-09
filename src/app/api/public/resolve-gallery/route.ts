/**
 * GET /api/public/resolve-gallery?handle=x&slug=y
 * Resolve handle + gallery slug to gallery id. No auth required.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isReservedHandle } from "@/lib/public-handle";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle")?.toLowerCase().trim();
  const slug = url.searchParams.get("slug")?.toLowerCase().trim();

  if (!handle || !slug) {
    return NextResponse.json({ error: "handle and slug required" }, { status: 400 });
  }

  if (isReservedHandle(handle)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getAdminFirestore();

  const profilesSnap = await db
    .collection("profiles")
    .where("public_slug", "==", handle)
    .limit(1)
    .get();

  if (profilesSnap.empty) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const photographerId = profilesSnap.docs[0].id;

  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", photographerId)
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (galleriesSnap.empty) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const galleryId = galleriesSnap.docs[0].id;

  return NextResponse.json({
    gallery_id: galleryId,
    photographer_id: photographerId,
  });
}
