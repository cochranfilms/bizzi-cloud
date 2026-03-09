/**
 * Extract JPEG preview from RAW files for thumbnail generation.
 * 1. Pure JS fallback: scan for embedded JPEG (FF D8 FF ... FF D9) - works on Vercel, no Perl.
 * 2. exiftool-vendored: when available (local dev, environments with Perl).
 */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";

/**
 * Extract embedded JPEG from buffer by scanning for SOI/EOI markers.
 * Most RAW formats (ARW, CR2, NEF, DNG, etc.) embed a JPEG preview.
 * Pure JS - works on Vercel and any serverless without Perl.
 */
function extractEmbeddedJpegFromBuffer(buffer: Buffer): Buffer | null {
  const arr = new Uint8Array(buffer);
  let start = -1;
  for (let i = 0; i <= arr.length - 3; i++) {
    if (arr[i] === 0xff && arr[i + 1] === 0xd8 && arr[i + 2] === 0xff) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let end = -1;
  for (let i = start + 2; i <= arr.length - 2; i++) {
    if (arr[i] === 0xff && arr[i + 1] === 0xd9) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return null;

  const slice = buffer.subarray(start, end + 1);
  return slice.length >= 100 ? Buffer.from(slice) : null;
}

/**
 * Extract a JPEG buffer from a RAW file buffer.
 * 1. Pure JS: scan for embedded JPEG (works everywhere, including Vercel)
 * 2. exiftool: when available (local dev with Perl)
 */
export async function extractRawPreview(rawBuffer: Buffer, fileName: string): Promise<Buffer | null> {
  // 1. Pure JS fallback - works on Vercel, no Perl needed
  const embedded = extractEmbeddedJpegFromBuffer(rawBuffer);
  if (embedded) return embedded;

  // 2. exiftool (requires Perl - fails on Vercel, works locally)
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
      return jpegBuffer.length > 0 ? jpegBuffer : null;
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
    if (isCover) {
      return await sharp(preview)
        .resize({ width: maxSize, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    }
    return await sharp(preview)
      .resize(maxSize, maxSize, { fit, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}
