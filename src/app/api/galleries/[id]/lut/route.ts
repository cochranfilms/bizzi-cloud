/**
 * POST /api/galleries/[id]/lut
 * Upload LUT file (.cube) for a gallery. Requires gallery owner auth.
 * Stores in Firebase Storage at galleries/{galleryId}/lut.cube
 * Updates gallery.lut and returns the URL.
 *
 * DELETE /api/galleries/[id]/lut
 * Remove LUT file and clear gallery.lut.
 */
import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const STORAGE_PATH = (galleryId: string) => `galleries/${galleryId}/lut.cube`;

async function requireGalleryOwner(
  request: Request,
  galleryId: string
): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const galleryData = gallerySnap.data()!;
  if (galleryData.photographer_id !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return { uid };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) {
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });
  }

  const auth = await requireGalleryOwner(request, galleryId);
  if (auth instanceof NextResponse) return auth;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse form data" },
      { status: 400 }
    );
  }

  const file = formData.get("lut");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No LUT file provided" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "cube") {
    return NextResponse.json(
      { error: "Invalid file type. Only .cube LUT files are supported." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "LUT file must be under 2 MB" },
      { status: 400 }
    );
  }

  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const blob = bucket.file(STORAGE_PATH(galleryId));

  const buffer = Buffer.from(await file.arrayBuffer());
  await blob.save(buffer, {
    metadata: {
      contentType: "text/plain",
    },
  });

  const [url] = await blob.getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });

  const db = getAdminFirestore();
  const existingLut = (await db.collection("galleries").doc(galleryId).get()).data()?.lut ?? {};
  await db.collection("galleries").doc(galleryId).update({
    lut: {
      ...existingLut,
      enabled: existingLut.enabled ?? true,
      storage_url: url,
    },
    updated_at: new Date(),
  });

  return NextResponse.json({ storage_url: url });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) {
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });
  }

  const auth = await requireGalleryOwner(request, galleryId);
  if (auth instanceof NextResponse) return auth;

  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const blob = bucket.file(STORAGE_PATH(galleryId));

  try {
    await blob.delete();
  } catch {
    // File may not exist; continue to clear DB
  }

  const db = getAdminFirestore();
  await db.collection("galleries").doc(galleryId).update({
    lut: { enabled: false, storage_url: null, object_key: null },
    updated_at: new Date(),
  });

  return NextResponse.json({ ok: true });
}
