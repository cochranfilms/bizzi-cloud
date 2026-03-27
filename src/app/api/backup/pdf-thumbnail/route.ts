/**
 * GET /api/backup/pdf-thumbnail?object_key=...&name=...
 * Renders the first page of a PDF as a JPEG thumbnail for card previews.
 * Uses pdfjs-dist + @napi-rs/canvas for Vercel serverless compatibility.
 */
import { getObjectBuffer, isB2Configured } from "@/lib/b2";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

// Resolve pdfjs-dist path. process.cwd() is project root (/var/task on Vercel).
function getPdfjsPath(): string {
  return path.join(process.cwd(), "node_modules", "pdfjs-dist");
}

let workerInitialized = false;
function ensureWorkerAndGetPath(): string {
  const basePath = getPdfjsPath();
  if (!workerInitialized) {
    const workerPath = path.join(basePath, "legacy", "build", "pdf.worker.min.mjs");
    GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
    workerInitialized = true;
  }
  return basePath;
}

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const PDF_EXT = /\.pdf$/i;
const THUMB_SIZE = 256;
/** Max PDF size to load for first-page rasterization (Vercel memory/time). */
const PDF_MAX_BYTES = 52 * 1024 * 1024;

function isPdfFile(name: string): boolean {
  return PDF_EXT.test(name.toLowerCase());
}

export async function GET(request: Request) {
  try {
    return await handlePdfThumbnail(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF thumbnail failed";
    console.error("[pdf-thumbnail] Unhandled error:", err);
    return new NextResponse(msg, { status: 500 });
  }
}

async function handlePdfThumbnail(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
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

  if (!isPdfFile(fileName || objectKey)) {
    return new NextResponse("Not a PDF file", { status: 400 });
  }

  const result = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!result.allowed) {
    return new NextResponse(result.message ?? "Access denied", {
      status: result.status ?? 403,
    });
  }

  try {
    const basePath = ensureWorkerAndGetPath();
    const buffer = await getObjectBuffer(objectKey, PDF_MAX_BYTES);
    const data = new Uint8Array(buffer);

    const pdfDocument = await getDocument({
      data,
      standardFontDataUrl: path.join(basePath, "standard_fonts") + path.sep,
      cMapUrl: path.join(basePath, "cmaps") + path.sep,
      cMapPacked: true,
      isEvalSupported: false,
    }).promise;

    if (pdfDocument.numPages < 1) {
      return new NextResponse("PDF has no pages", { status: 422 });
    }

    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height)
    );
    const context = canvas.getContext("2d");

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;

    const pngBuffer = await canvas.toBuffer("image/png");

    const resized = await sharp(pngBuffer)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return new NextResponse(new Uint8Array(resized), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=604800",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF thumbnail generation failed";
    const stack = err instanceof Error ? err.stack : undefined;
    const isNotFound =
      typeof msg === "string" &&
      (msg.includes("NoSuchKey") || msg.includes("NotFound") || msg.includes("not found"));
    const tooLarge =
      typeof msg === "string" &&
      (msg.includes("too large") || msg.includes("Object too large"));
    if (tooLarge) {
      return new NextResponse("PDF too large for thumbnail", { status: 413 });
    }
    console.error("[pdf-thumbnail] Error:", msg, stack ?? err);

    return new NextResponse(
      isNotFound ? msg : "PDF thumbnail generation failed",
      { status: isNotFound ? 404 : 500 }
    );
  }
}
