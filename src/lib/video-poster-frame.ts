/**
 * Grid/list video poster frame (480×270 JPEG) — shared by API routes and documented parity
 * with Linux proxy workers (`scripts/video-poster-frame-worker.mjs`). Keep dimensions/filter in sync.
 */
export const VIDEO_POSTER_WIDTH = 480;
export const VIDEO_POSTER_HEIGHT = 270;
export const VIDEO_POSTER_JPEG_Q = 3;
export const VIDEO_POSTER_FFMPEG_TIMEOUT_MS = 45_000;

export function videoPosterScalePadFilter(): string {
  return `scale=${VIDEO_POSTER_WIDTH}:${VIDEO_POSTER_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_POSTER_WIDTH}:${VIDEO_POSTER_HEIGHT}:(ow-iw)/2:(oh-ih)/2`;
}

/** Args for extracting one poster frame to a file (local path `-i`, e.g. worker temp proxy mp4). */
export function videoPosterFrameFfmpegArgsFileInput(
  localInputPath: string,
  seekSeconds: number,
  outputJpegPath: string
): string[] {
  return [
    "-y",
    "-nostdin",
    "-probesize",
    "32K",
    "-analyzeduration",
    "500000",
    "-ss",
    String(seekSeconds),
    "-t",
    "5",
    "-i",
    localInputPath,
    "-vframes",
    "1",
    "-vf",
    videoPosterScalePadFilter(),
    "-f",
    "image2",
    "-q:v",
    String(VIDEO_POSTER_JPEG_Q),
    outputJpegPath,
  ];
}

/** Same geometry as file path, but stdout JPEG (`pipe:1`) for API cold paths. */
export function videoPosterFrameFfmpegArgsPipeInput(
  input: string,
  seekSeconds: number
): string[] {
  return [
    "-y",
    "-nostdin",
    "-probesize",
    "32K",
    "-analyzeduration",
    "500000",
    "-ss",
    String(seekSeconds),
    "-t",
    "5",
    "-i",
    input,
    "-vframes",
    "1",
    "-vf",
    videoPosterScalePadFilter(),
    "-f",
    "image2",
    "-q:v",
    String(VIDEO_POSTER_JPEG_Q),
    "pipe:1",
  ];
}
