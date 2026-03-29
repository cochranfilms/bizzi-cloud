/**
 * Typed shapes for GET /api/galleries/[id]/video-stream-url (and shared client parsing).
 */

export type GalleryVideoSourceType = "mux_hls" | "proxy_mp4" | "original_mp4";

export type GalleryVideoStreamSuccessBody = {
  streamUrl: string;
  sourceType: GalleryVideoSourceType;
  /** True when Mux exists but is not ready yet; client may poll for mux_hls. */
  muxPlaybackPending: boolean;
  /** Legacy; true for Mux HLS. Prefer sourceType === "mux_hls". */
  isHls?: boolean;
};

export type GalleryVideoStreamProcessingBody = {
  processing: true;
  message?: string;
};

export function isGalleryVideoStreamSuccess(
  body: unknown
): body is GalleryVideoStreamSuccessBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.streamUrl === "string" &&
    b.streamUrl.length > 0 &&
    typeof b.sourceType === "string" &&
    typeof b.muxPlaybackPending === "boolean"
  );
}

/** Canonical: Mux HLS is ready (do not rely on URL shape alone). */
export function isMuxHlsSource(body: GalleryVideoStreamSuccessBody): boolean {
  return body.sourceType === "mux_hls";
}

/**
 * Start polling only when API says an upgrade to Mux may arrive and we have a playable URL.
 */
export function shouldStartMuxStreamUpgradePoll(body: GalleryVideoStreamSuccessBody): boolean {
  return body.muxPlaybackPending === true && body.streamUrl.length > 0;
}
