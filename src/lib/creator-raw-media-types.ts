/**
 * Shared types for Creator RAW media inspection and validation (single source of truth for shape).
 */

export type InspectedMediaStreams = {
  detectedContainer: string | null;
  /** Primary video stream codec_name from ffprobe */
  detectedVideoCodec: string | null;
  /**
   * Mezzanine detection hints: `codec_long_name` plus selected stream/format tag values (e.g. encoder).
   * Used only when codec_name is generic (`mpeg4` / `unknown` / empty) in policy — not for H.264/HEVC.
   */
  detectedCodecLongName: string | null;
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
