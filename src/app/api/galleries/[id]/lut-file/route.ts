/**
 * GET /api/galleries/[id]/lut-file?entry_id=xxx
 * Proxies custom LUT files so clients can fetch same-origin (avoids CORS).
 * Uses same access control as gallery view.
 */
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id");
  const password = url.searchParams.get("password") ?? undefined;
  const authHeader = request.headers.get("Authorization");
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));

  if (!galleryId || !entryId) {
    return NextResponse.json({ error: "gallery id and entry_id required" }, { status: 400 });
  }

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
    { authHeader, password, clientEmail }
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const library = (g.creative_lut_library ?? []) as Array<{ id: string; storage_path?: string | null }>;
  const entry = library.find((e) => e.id === entryId);
  if (!entry?.storage_path) {
    return NextResponse.json({ error: "LUT not found" }, { status: 404 });
  }

  try {
    const storage = getAdminStorage();
    const blob = storage.bucket().file(entry.storage_path);
    const [exists] = await blob.exists();
    if (!exists) {
      return NextResponse.json({ error: "LUT file not found" }, { status: 404 });
    }
    const [buffer] = await blob.download();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to load LUT" }, { status: 500 });
  }
}
