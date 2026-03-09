/**
 * Extract JPEG preview from RAW files for thumbnail generation.
 * Uses exiftool-vendored to extract embedded preview, then Sharp can resize.
 */
import { exiftool } from "exiftool-vendored";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";

/**
 * Extract a JPEG buffer from a RAW file buffer.
 * Tries extractPreview first (embedded preview), then extractJpgFromRaw.
 * Returns null if extraction fails.
 */
export async function extractRawPreview(rawBuffer: Buffer, fileName: string): Promise<Buffer | null> {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `raw-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  const outputPath = path.join(tmpDir, `preview-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);

  try {
    await fs.writeFile(inputPath, rawBuffer);

    try {
      await exiftool.extractPreview(inputPath, outputPath);
    } catch {
      try {
        await exiftool.extractJpgFromRaw(inputPath, outputPath);
      } catch {
        try {
          await exiftool.extractThumbnail(inputPath, outputPath);
        } catch {
          return null;
        }
      }
    }

    const jpegBuffer = await fs.readFile(outputPath);
    return jpegBuffer.length > 0 ? jpegBuffer : null;
  } catch {
    return null;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
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
