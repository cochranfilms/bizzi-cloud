import { getObjectBuffer, isB2Configured } from "@/lib/b2";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import sharp from "sharp";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff?|heic)$/i;

type ThumbSize = "thumb" | "preview";
const SIZES: Record<ThumbSize, number> = { thumb: 256, preview: 1024 };

async function verifyObjectAccess(uid: string, objectKey: string): Promise<boolean> {
  if (objectKey.startsWith("content/")) {
    const db = getAdminFirestore();
    const snap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    if (snap.empty) return false;
    return !snap.docs[0].data().deleted_at;
  }
  const prefix = `backups/${uid}/`;
  return objectKey.startsWith(prefix);
}

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

export async function GET(request: Request) {
  try {
    return await handleThumbnail(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Thumbnail failed";
    console.error("[thumbnail] Unhandled error:", err);
    return new NextResponse(msg, { status: 500 });
  }
}

async function handleThumbnail(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const sizeParam = (url.searchParams.get("size") ?? "thumb") as ThumbSize;
  const size = SIZES[sizeParam] ?? SIZES.thumb;
  const fileName = url.searchParams.get("name") ?? "";

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const userIdParam = url.searchParams.get("user_id");

  if (isDevAuthBypass() && typeof userIdParam === "string") {
    uid = userIdParam;
  } else if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return new NextResponse("Invalid token", { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return new NextResponse("object_key required", { status: 400 });
  }

  if (!isImageFile(fileName || objectKey)) {
    return new NextResponse("Not an image file", { status: 400 });
  }

  const hasAccess = await verifyObjectAccess(uid, objectKey);
  if (!hasAccess) {
    return new NextResponse("Access denied", { status: 403 });
  }

  try {
    const buffer = await getObjectBuffer(objectKey);
    const resized = await sharp(buffer)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return new NextResponse(new Uint8Array(resized), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Thumbnail generation failed";
    const stack = err instanceof Error ? err.stack : undefined;
    const isNotFound =
      typeof msg === "string" &&
      (msg.includes("NoSuchKey") || msg.includes("NotFound") || msg.includes("not found"));
    console.error("[thumbnail] Error:", msg, stack ?? err);

    // Sharp can fail on malformed images or Vercel/serverless env - surface the real error
    const isSharpError =
      typeof msg === "string" &&
      (msg.toLowerCase().includes("sharp") ||
        msg.includes("vips") ||
        msg.includes("Invalid"));
    const body = process.env.NODE_ENV === "development" && isSharpError ? msg : undefined;

    return new NextResponse(body ?? (isNotFound ? msg : "Thumbnail generation failed"), {
      status: isNotFound ? 404 : 500,
      headers: body ? { "Content-Type": "text/plain" } : undefined,
    });
  }
}
