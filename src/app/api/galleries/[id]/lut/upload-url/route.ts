/**
 * Gallery LUT direct upload — returns signed upload URL.
 * Use for files > 4 MB (Vercel body limit). Client uploads to returned URL, then calls POST /lut with confirm payload.
 */
import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase-admin";
import { MAX_LUTS_PER_SCOPE } from "@/types/creative-lut";
import type { CreativeLUTLibraryEntry } from "@/types/creative-lut";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";
import { randomUUID } from "crypto";

const STORAGE_PREFIX = (galleryId: string) => `galleries/${galleryId}/lut`;

async function requireGalleryOwner(
  request: Request,
  galleryId: string
): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    const uid = decoded.uid;
    const db = getAdminFirestore();
    const gallerySnap = await db.collection("galleries").doc(galleryId).get();
    if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
    const galleryData = gallerySnap.data()!;
    if (!(await userCanManageGalleryAsPhotographer(uid, galleryData))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return { uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const auth = await requireGalleryOwner(request, galleryId);
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string; extension?: string };
  try {
    body = (await request.json().catch(() => ({}))) as { name?: string; extension?: string };
  } catch {
    body = {};
  }

  const db = getAdminFirestore();
  const snap = await db.collection("galleries").doc(galleryId).get();
  if (!snap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const data = snap.data()!;
  const library: CreativeLUTLibraryEntry[] = (data.creative_lut_library ?? []) as CreativeLUTLibraryEntry[];
  const customCount = library.filter((e) => e.mode === "custom").length;
  if (customCount >= MAX_LUTS_PER_SCOPE) {
    return NextResponse.json(
      { error: `Maximum ${MAX_LUTS_PER_SCOPE} LUTs installed. Remove one to add another.` },
      { status: 400 }
    );
  }

  const ext =
    body.extension === "3dl" ? "3dl" : body.extension === "cube" ? "cube" : "cube";
  const entryId = randomUUID();
  const storagePath = `${STORAGE_PREFIX(galleryId)}/${entryId}.${ext}`;

  const storage = getAdminStorage();
  const file = storage.bucket().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    action: "write",
    expires: "03-01-2500",
    contentType: "text/plain",
  });

  return NextResponse.json({
    upload_url: uploadUrl,
    entry_id: entryId,
    storage_path: storagePath,
    name: (body.name && typeof body.name === "string") ? body.name : null,
  });
}
