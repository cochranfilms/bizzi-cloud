/**
 * Poster JPEG ffmpeg argv — keep in sync with src/lib/video-poster-frame.ts (grid 480×270).
 * Used by standard-proxy-worker and braw-proxy-worker after proxy encode.
 */
export const VIDEO_POSTER_WIDTH = 480;
export const VIDEO_POSTER_HEIGHT = 270;
export const VIDEO_POSTER_JPEG_Q = 3;
export const VIDEO_POSTER_FFMPEG_TIMEOUT_MS = 45_000;

export function videoPosterScalePadFilter() {
  return `scale=${VIDEO_POSTER_WIDTH}:${VIDEO_POSTER_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_POSTER_WIDTH}:${VIDEO_POSTER_HEIGHT}:(ow-iw)/2:(oh-ih)/2`;
}

export function videoPosterFrameFfmpegArgsFileInput(localInputPath, seekSeconds, outputJpegPath) {
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
