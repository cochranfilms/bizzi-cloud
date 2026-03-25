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
 * Find all embedded JPEGs in buffer (SOI FF D8 FF ... EOI FF D9).
 * Returns the largest one - RAW files often embed a tiny thumbnail first,
 * then a larger preview. Using the largest gives sharp thumbnails.
 */
function extractEmbeddedJpegFromBuffer(buffer: Buffer): Buffer | null {
  const arr = new Uint8Array(buffer);
  const candidates: { start: number; end: number }[] = [];

  let i = 0;
  while (i <= arr.length - 3) {
    if (arr[i] === 0xff && arr[i + 1] === 0xd8 && arr[i + 2] === 0xff) {
      const start = i;
      let end = -1;
      for (let j = start + 2; j <= arr.length - 2; j++) {
        if (arr[j] === 0xff && arr[j + 1] === 0xd9) {
          end = j + 1;
          break;
        }
      }
      if (end >= 0) {
        candidates.push({ start, end });
        i = end + 1;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => {
    const sizeA = a.end - a.start + 1;
    const sizeB = b.end - b.start + 1;
    return sizeA >= sizeB ? a : b;
  });

  const slice = buffer.subarray(best.start, best.end + 1);
  return slice.length >= 100 ? Buffer.from(slice) : null;
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

export async function extractRawPreview(rawBuffer: Buffer, fileName: string): Promise<Buffer | null> {
  // 1. Pure JS fallback - works on Vercel, no Perl needed
  const embedded = extractEmbeddedJpegFromBuffer(rawBuffer);
  if (embedded) return embedded;

  // 2. libvips / sharp (may decode ARW, DNG, etc. depending on build)
  const sharpJpeg = await trySharpDecodeRawBuffer(rawBuffer);
  if (sharpJpeg) return sharpJpeg;

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
