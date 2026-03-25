/**
 * Extract JPEG preview from RAW files for thumbnail generation.
 * 1. Pure JS fallback: scan for embedded JPEG (SOI FF D8 … EOI FF D9) - works on Vercel, no Perl.
 * 2. exiftool-vendored: when available (local dev, environments with Perl).
 */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";

/**
 * Find embedded JPEG(s) in buffer (SOI FF D8 ... EOI FF D9).
 * Uses JPEG SOI (FF D8) only — not FF D8 FF — so we never miss valid starts.
 *
 * Important: the first FF D9 after SOI is often wrong — EXIF/TIFF inside APP1
 * can contain the byte pair FF D9, which would truncate the JPEG and break
 * decoding (common with Sony ARW and other camera RAWs). We take the last FF D9
 * in each SOI region (up to the next SOI or EOF) as the real EOI.
 */
function extractEmbeddedJpegFromBuffer(buffer: Buffer): Buffer | null {
  const arr = new Uint8Array(buffer);
  const candidates: { start: number; end: number }[] = [];

  let i = 0;
  while (i <= arr.length - 2) {
    if (arr[i] !== 0xff || arr[i + 1] !== 0xd8) {
      i++;
      continue;
    }
    const start = i;
    let nextSoi = -1;
    for (let k = start + 2; k <= arr.length - 2; k++) {
      if (arr[k] === 0xff && arr[k + 1] === 0xd8) {
        nextSoi = k;
        break;
      }
    }
    const scanEnd = nextSoi >= 0 ? nextSoi - 1 : arr.length - 1;
    let end = -1;
    for (let k = start + 2; k <= scanEnd - 1; k++) {
      if (arr[k] === 0xff && arr[k + 1] === 0xd9) {
        end = k + 1;
      }
    }
    if (end >= start) {
      candidates.push({ start, end });
      i = end + 1;
    } else {
      i = start + 2;
    }
  }

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => {
    const sizeA = a.end - a.start + 1;
    const sizeB = b.end - b.start + 1;
    return sizeA >= sizeB ? a : b;
  });

  const slice = buffer.subarray(best.start, best.end + 1);
  return slice.length >= 64 ? Buffer.from(slice) : null;
}

/**
 * Extract a JPEG buffer from a RAW file buffer.
 * 1. Pure JS: scan for embedded JPEG (works everywhere, including Vercel)
 * 2. exiftool: when available (local dev with Perl)
 */
/** Try decoding RAW buffer with sharp/libvips (works for some formats when libraw is available). */
async function trySharpDecodeRawBuffer(rawBuffer: Buffer): Promise<Buffer | null> {
  try {
    const meta = await sharp(rawBuffer).metadata();
    if (!meta.width || !meta.height) return null;
    return await sharp(rawBuffer).rotate().jpeg({ quality: 85 }).toBuffer();
  } catch {
    return null;
  }
}

/**
 * Bake EXIF orientation into pixels and strip tags. Fixes sideways ARW/JPEG previews
 * when embedded preview has correct EXIF; also normalizes output for downstream sharp.
 */
async function bakeEmbeddedJpegOrientation(buffer: Buffer): Promise<Buffer | null> {
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return null;
    return await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer();
  } catch {
    return null;
  }
}

/**
 * If embedded JPEG had no usable EXIF orientation but the container RAW does (Sony ARW),
 * rotate the baked preview using the RAW file's EXIF Orientation. Skips when embedded
 * already had orientation EXIF (bakeEmbeddedJpegOrientation handled it).
 */
async function alignEmbeddedPreviewToRawOrientation(
  previewBuffer: Buffer,
  rawBuffer: Buffer,
  embeddedHadExifOrientation: boolean
): Promise<Buffer> {
  if (embeddedHadExifOrientation) return previewBuffer;
  let rawOrient: number | undefined;
  try {
    rawOrient = (await sharp(rawBuffer).metadata()).orientation;
  } catch {
    return previewBuffer;
  }
  if (!rawOrient || rawOrient <= 1) return previewBuffer;
  const angle = exifOrientationToRotationAngle(rawOrient);
  if (angle === undefined) return previewBuffer;
  try {
    return await sharp(previewBuffer).rotate(angle).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return previewBuffer;
  }
}

/**
 * Clockwise degrees for sharp().rotate(angle) to normalize EXIF orientation.
 * Swapped 6 vs 8 vs earlier build — Sony ARW embedded previews commonly need 270° not 90° for tag 6.
 */
function exifOrientationToRotationAngle(orientation: number): number | undefined {
  switch (orientation) {
    case 2:
    case 4:
    case 5:
    case 7:
      return undefined;
    case 3:
      return 180;
    case 6:
      return 270;
    case 8:
      return 90;
    default:
      return undefined;
  }
}

/**
 * If RAW pixel dimensions suggest portrait vs landscape but preview does not (or vice versa),
 * apply one 90° step — catches ARW previews with wrong rotation when EXIF is inconsistent.
 */
type RawShapeMeta = { width?: number; height?: number; orientation?: number };

async function maybeFixOrientationByDimensions(
  previewBuffer: Buffer,
  rawMeta: RawShapeMeta
): Promise<Buffer> {
  if (rawMeta.orientation != null && rawMeta.orientation > 1) {
    return previewBuffer;
  }
  let pMeta: sharp.Metadata;
  try {
    pMeta = await sharp(previewBuffer).metadata();
  } catch {
    return previewBuffer;
  }
  const rw = rawMeta.width;
  const rh = rawMeta.height;
  const pw = pMeta.width;
  const ph = pMeta.height;
  if (!rw || !rh || !pw || !ph) return previewBuffer;
  const rawPortrait = rh > rw;
  const previewPortrait = ph > pw;
  if (rawPortrait === previewPortrait) return previewBuffer;
  try {
    return await sharp(previewBuffer).rotate(90).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return previewBuffer;
  }
}

async function processEmbeddedJpegPreview(embedded: Buffer, rawBuffer: Buffer): Promise<Buffer | null> {
  let rawMeta: RawShapeMeta = {};
  try {
    rawMeta = await sharp(rawBuffer).metadata();
  } catch {
    rawMeta = {};
  }

  try {
    const embMeta = await sharp(embedded).metadata();
    if (!embMeta.width || !embMeta.height) return null;
    const embO = embMeta.orientation ?? 1;
    const rawO = rawMeta.orientation ?? 1;

    // When RAW orientation disagrees with embedded preview EXIF, trust RAW (Sony ARW previews often lie).
    if (rawO > 1 && rawO !== embO) {
      const angle = exifOrientationToRotationAngle(rawO);
      if (angle !== undefined) {
        const out = await sharp(embedded).rotate(angle).jpeg({ quality: 90 }).toBuffer();
        return await maybeFixOrientationByDimensions(out, rawMeta);
      }
    }

    const baked = await bakeEmbeddedJpegOrientation(embedded);
    if (!baked) return null;
    const out = await alignEmbeddedPreviewToRawOrientation(baked, rawBuffer, embO > 1);
    return await maybeFixOrientationByDimensions(out, rawMeta);
  } catch {
    return null;
  }
}

export async function extractRawPreview(rawBuffer: Buffer, fileName: string): Promise<Buffer | null> {
  // 1. Full-file decode when libvips/libraw supports it — best orientation and color
  const sharpJpeg = await trySharpDecodeRawBuffer(rawBuffer);
  if (sharpJpeg) return sharpJpeg;

  // 2. Embedded JPEG (camera preview)
  const embedded = extractEmbeddedJpegFromBuffer(rawBuffer);
  if (embedded) {
    const processed = await processEmbeddedJpegPreview(embedded, rawBuffer);
    if (processed) return processed;
  }

  // 3. exiftool (requires Perl - fails on Vercel, works locally)
  try {
    const { exiftool } = await import("exiftool-vendored");
    const ext = path.extname(fileName).toLowerCase().slice(1);
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `raw-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    const outputPath = path.join(tmpDir, `preview-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);

    await fs.writeFile(inputPath, rawBuffer);
    try {
      try {
        await exiftool.extractPreview(inputPath, outputPath);
      } catch {
        try {
          await exiftool.extractJpgFromRaw(inputPath, outputPath);
        } catch {
          await exiftool.extractThumbnail(inputPath, outputPath);
        }
      }
      const jpegBuffer = await fs.readFile(outputPath);
      if (jpegBuffer.length === 0) return null;
      try {
        return await sharp(jpegBuffer).rotate().jpeg({ quality: 90 }).toBuffer();
      } catch {
        return jpegBuffer;
      }
    } finally {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }
  } catch {
    return null;
  }
}

/**
 * Convert a RAW buffer to a resized JPEG thumbnail.
 * Returns the JPEG buffer or null if conversion fails.
 */
export async function rawToThumbnail(
  rawBuffer: Buffer,
  fileName: string,
  maxSize: number,
  options?: { fit?: "inside" | "cover"; isCover?: boolean }
): Promise<Buffer | null> {
  const preview = await extractRawPreview(rawBuffer, fileName);
  if (!preview) return null;

  try {
    const { fit = "inside", isCover = false } = options ?? {};
    const pipeline = sharp(preview).rotate(); // Apply EXIF orientation (fixes rotated thumbnails)
    if (isCover) {
      return await pipeline
        .resize({ width: maxSize, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }
    return await pipeline
      .resize(maxSize, maxSize, { fit, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}
