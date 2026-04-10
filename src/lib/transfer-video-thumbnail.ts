import { spawn } from "child_process";
import {
  createPresignedDownloadUrl,
  objectExists,
  getObjectBuffer,
  putObject,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import ffmpegPath from "ffmpeg-static";
import { resolveFfmpegExecutableForInput } from "@/lib/ffmpeg-binary";
import { isBrawFile } from "@/lib/format-detection";
import sharp from "sharp";

const FFMPEG_TIMEOUT_MS = 45000;

export async function getTransferVideoThumbnail(objectKey: string): Promise<Buffer> {

  const cacheKey = getVideoThumbnailCacheKey(objectKey);
  try {
    if (await objectExists(cacheKey)) {
      const cached = await getObjectBuffer(cacheKey, 512 * 1024);
      if (cached.length > 0) return Buffer.from(cached);
    }
  } catch {
    // Regenerate
  }

  const proxyKey = getProxyObjectKey(objectKey);
  const hasProxy = await objectExists(proxyKey);

  const brawForkConfigured = Boolean(process.env.FFMPEG_BRAW_PATH?.trim());
  if (isBrawFile(objectKey) && !hasProxy && !brawForkConfigured) {
    return sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 3,
        background: { r: 64, g: 64, b: 64 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  const effectiveKey = hasProxy ? proxyKey : objectKey;
  const presignedUrl = await createPresignedDownloadUrl(effectiveKey, 600);

  const ffmpegBin = hasProxy
    ? (ffmpegPath ?? null)
    : resolveFfmpegExecutableForInput(objectKey);
  if (!ffmpegBin) {
    throw new Error("ffmpeg binary not found");
  }

  const runFfmpeg = (seekSeconds: number): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const stderrChunks: string[] = [];
      const proc = spawn(ffmpegBin, [
        "-y", "-nostdin",
        "-probesize", "32K",
        "-analyzeduration", "500000",
        "-ss", String(seekSeconds),
        "-t", "5",
        "-i", presignedUrl,
        "-vframes", "1",
        "-vf", "scale=1200:630:force_original_aspect_ratio=decrease,pad=1200:630:(ow-iw)/2:(oh-ih)/2",
        "-f", "image2",
        "-q:v", "3",
        "pipe:1",
      ], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
      });

      const chunks: Buffer[] = [];
      proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString()));

      const timeoutId = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("FFmpeg timeout"));
      }, FFMPEG_TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timeoutId);
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`FFmpeg exited ${code}`));
      });
      proc.on("error", (e) => {
        clearTimeout(timeoutId);
        reject(e);
      });
    });

  let buffer: Buffer;
  try {
    buffer = await runFfmpeg(0.5);
  } catch {
    try {
      buffer = await runFfmpeg(0);
    } catch (e) {
      throw new Error(`Video thumbnail failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  if (!buffer.length) throw new Error("Empty thumbnail");

  putObject(cacheKey, buffer, "image/jpeg").catch(() => {});

  return buffer;
}
