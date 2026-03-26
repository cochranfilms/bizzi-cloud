/**
 * POST /api/galleries/[id]/watermark
 * Upload watermark image for a gallery. Requires gallery owner auth.
 * Stores in Firebase Storage at galleries/{galleryId}/watermark.{ext}
 * Updates gallery.watermark.image_url and returns the URL.
 */
import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: galleryId } = await params;
  if (!galleryId) {
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const galleryData = gallerySnap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, galleryData))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

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

  const file = formData.get("watermark");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No watermark file provided" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use PNG, JPG, WebP, or GIF. Recommended: PNG with transparency." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 2 MB" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
    ? ext
    : "png";
  const storagePath = `galleries/${galleryId}/watermark.${safeExt}`;

  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const blob = bucket.file(storagePath);

  const buffer = Buffer.from(await file.arrayBuffer());
  await blob.save(buffer, {
    metadata: {
      contentType: file.type,
    },
  });

  const [url] = await blob.getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });

  const watermark = galleryData.watermark ?? {};
  await db.collection("galleries").doc(galleryId).update({
    watermark: { ...watermark, image_url: url },
    updated_at: new Date(),
  });

  return NextResponse.json({ image_url: url });
}
