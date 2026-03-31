/**
 * Shared types for Creator RAW media inspection and validation (single source of truth for shape).
 */

export type InspectedMediaStreams = {
  detectedContainer: string | null;
  /** Primary video stream codec_name from ffprobe */
  detectedVideoCodec: string | null;
  detectedCodecTag: string | null;
  detectedPixelFormat: string | null;
  detectedBitDepth: number | null;
  detectedWidth: number | null;
  detectedHeight: number | null;
  detectedFrameRate: number | null;
  hasVideoStream: boolean;
  probeError?: string | null;
};

export type CreatorRawMediaValidationResult = InspectedMediaStreams & {
  allowed: boolean;
  detectedMime: string | null;
  reason: string;
  userMessage: string;
  /** Stable machine code for logs */
  code: string;
};
