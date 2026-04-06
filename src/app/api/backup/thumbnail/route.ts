import {
  getObjectHeadBuffer,
  isB2Configured,
  putObject,
  objectExists,
} from "@/lib/b2";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase-admin";
import type { DocumentReference } from "firebase-admin/firestore";
import { GALLERY_IMAGE_EXT, isRawStillFile } from "@/lib/gallery-file-types";
import { isRawVideoFile, RAW_VIDEO_USE_VIDEO_THUMBNAIL_CODE } from "@/lib/raw-video";
import { rawToThumbnail } from "@/lib/raw-thumbnail";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getDownloadUrl } from "@/lib/cdn";
import { getImageListThumbnailObjectKey } from "@/lib/bizzi-image-thumbnail-key";
import { thumbnailRedirectToCdnEnabled } from "@/lib/delivery-flags";
import { withThumbnailFlight } from "@/lib/thumbnail-generation-flight";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

type ThumbSize = "thumb" | "preview";
const SIZES: Record<ThumbSize, number> = { thumb: 256, preview: 1024 };

/** Placeholder when RAW extraction fails */
async function createRawPlaceholder(size: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 64, g: 64, b: 64 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

function isImageFile(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name);
}

async function findBackupFileRefForObjectKey(
  uid: string,
  objectKey: string
): Promise<{ id: string; ref: DocumentReference } | null> {
  const db = getAdminFirestore();
  const [byCamel, bySnake] = await Promise.all([
    db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("object_key", "==", objectKey)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .limit(1)
      .get(),
    db
      .collection("backup_files")
      .where("user_id", "==", uid)
      .where("object_key", "==", objectKey)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .limit(1)
      .get(),
  ]);
  const doc = !byCamel.empty ? byCamel.docs[0] : !bySnake.empty ? bySnake.docs[0] : null;
  if (!doc) return null;
  return { id: doc.id, ref: doc.ref };
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
  const objectKeyRaw = url.searchParams.get("object_key");
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

  if (!objectKeyRaw || typeof objectKeyRaw !== "string") {
    return new NextResponse("object_key required", { status: 400 });
  }
  const objectKey = objectKeyRaw;

  const nameForPolicy = fileName || objectKey || "";
  if (isRawVideoFile(nameForPolicy)) {
    return NextResponse.json(
      {
        error: "Cinema RAW video must use the video-thumbnail endpoint, not still-image extraction.",
        code: RAW_VIDEO_USE_VIDEO_THUMBNAIL_CODE,
      },
      { status: 400 }
    );
  }

  if (!isImageFile(nameForPolicy)) {
    return new NextResponse("Not an image file", { status: 400 });
  }

  const result = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!result.allowed) {
    return new NextResponse(result.message ?? "Access denied", {
      status: result.status ?? 403,
    });
  }

  const nameForExt = (fileName || objectKey || "").toLowerCase();
  const isRaw = isRawStillFile(nameForExt);

  const THUMB_MAX_BYTES = 50 * 1024 * 1024; // 50 MB - enough for image/RAW thumbnail extraction

  /** Build JPEG bytes for grid / modal thumbnail (legacy or cold-miss before putObject). */
  async function buildThumbnailJpegBytes(): Promise<Buffer> {
    const buffer = await getObjectHeadBuffer(objectKey, THUMB_MAX_BYTES);
    let resized: Uint8Array;
    if (isRaw) {
      const thumb = await rawToThumbnail(
        Buffer.from(buffer),
        nameForExt || "raw",
        size,
        { fit: "inside" }
      );
      if (!thumb) {
        resized = new Uint8Array(await createRawPlaceholder(size));
      } else {
        resized = new Uint8Array(thumb);
      }
    } else {
      resized = new Uint8Array(
        await sharp(buffer)
          .rotate()
          .resize(size, size, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer()
      );
    }
    return Buffer.from(resized);
  }

  try {
    if (thumbnailRedirectToCdnEnabled() && sizeParam === "thumb") {
      const thumbKey = getImageListThumbnailObjectKey(objectKey, "thumb");
      const backupRow = await findBackupFileRefForObjectKey(uid, objectKey);
      const snap = backupRow ? await backupRow.ref.get() : null;
      const data = snap?.data();
      const dbReady =
        data?.image_thumb_status === "ready" &&
        data?.image_thumb_object_key === thumbKey;
      if (dbReady) {
        const signed = await getDownloadUrl(thumbKey, 604_800, undefined, true);
        return NextResponse.redirect(signed, 307);
      }
      if (await objectExists(thumbKey)) {
        if (backupRow) {
          await backupRow.ref
            .update({
              image_thumb_status: "ready",
              image_thumb_object_key: thumbKey,
            })
            .catch(() => {});
        }
        const signed = await getDownloadUrl(thumbKey, 604_800, undefined, true);
        return NextResponse.redirect(signed, 307);
      }

      await withThumbnailFlight(`${uid}:${objectKey}:thumb`, async () => {
        if (await objectExists(thumbKey)) return;
        const jpeg = await buildThumbnailJpegBytes();
        await putObject(thumbKey, jpeg, "image/jpeg");
        if (backupRow) {
          await backupRow.ref
            .update({
              image_thumb_status: "ready",
              image_thumb_object_key: thumbKey,
            })
            .catch(() => {});
        }
      });
      const signed = await getDownloadUrl(thumbKey, 604_800, undefined, true);
      return NextResponse.redirect(signed, 307);
    }

    const resizedBuffer = await buildThumbnailJpegBytes();
    return new NextResponse(new Uint8Array(resizedBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=604800",
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
