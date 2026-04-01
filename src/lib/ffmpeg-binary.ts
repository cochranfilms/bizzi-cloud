/**
 * Resolve FFmpeg binary for a given input by leaf extension.
 * Note: `.braw` **proxy transcode** uses the dedicated Linux worker (`/api/workers/braw-proxy/*`), not this path.
 * `FFMPEG_BRAW_PATH` still applies to **video-thumbnail** and any non–BRAW-worker flows that spawn FFmpeg on `.braw`.
 * @module ffmpeg-binary
 */
import ffmpegPath from "ffmpeg-static";
import { isBrawFile } from "@/lib/format-detection";

const FFMPEG_BRAW_PATH = process.env.FFMPEG_BRAW_PATH || "";

/**
 * Returns path to ffmpeg executable for decoding `nameOrPath`, or null if static ffmpeg unavailable.
 * Uses FFMPEG_BRAW_PATH for .braw when set.
 */
export function resolveFfmpegExecutableForInput(nameOrPath: string): string | null {
  const base = ffmpegPath ?? null;
  if (!base) return null;
  if (isBrawFile(nameOrPath) && FFMPEG_BRAW_PATH) return FFMPEG_BRAW_PATH;
  return base;
}
