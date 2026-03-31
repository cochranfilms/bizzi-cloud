/**
 * Pure helpers for Creator RAW immersive preview (proxy-first, no original playback).
 * Used by FilePreviewModal and regression tests.
 */

export type VideoStreamUrlBody = {
  streamUrl?: string;
  processing?: boolean;
  resolution_w?: number;
  resolution_h?: number;
  proxyUnavailable?: boolean;
};

/** After a successful stream-url response, Creator RAW should keep “processing” until a stream URL exists. */
export function creatorRawVideoRemainsProcessingUntilStream(
  showLUTForVideo: boolean,
  resOk: boolean,
  body: VideoStreamUrlBody | null | undefined
): boolean {
  if (!showLUTForVideo || !resOk) return true;
  if (body?.proxyUnavailable) return false;
  const url = body?.streamUrl;
  if (typeof url === "string" && url.length > 0) return false;
  return true;
}

/** Non–Creator RAW may end processing after polls to allow preview-url fallback. Creator RAW never does. */
export function nonCreatorRawPollMayEndProcessingWithoutStream(
  showLUTForVideo: boolean,
  pollCount: number,
  hasPreviewUrlFallback: boolean
): boolean {
  if (showLUTForVideo) return false;
  return hasPreviewUrlFallback && pollCount >= 10;
}

export function creatorRawUsesProxyOnlyPlayback(showLUTForVideo: boolean, previewIsVideo: boolean): boolean {
  return showLUTForVideo && previewIsVideo;
}
