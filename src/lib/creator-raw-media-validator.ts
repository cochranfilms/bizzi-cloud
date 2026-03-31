/**
 * classifyCreatorRawMedia / isAllowedCreatorRawMedia — codec-level policy on top of ffprobe fields.
 */

import {
  CREATOR_RAW_MEDIA_POLICY,
  CREATOR_RAW_REJECTION_MESSAGES,
} from "@/lib/creator-raw-media-config";
import type { InspectedMediaStreams } from "@/lib/creator-raw-media-types";
import type { CreatorRawMediaValidationResult } from "@/lib/creator-raw-media-types";

const ALLOWED_CODEC = new Set<string>(CREATOR_RAW_MEDIA_POLICY.allowedVideoCodecs);
const ALLOWED_TAG = new Set<string>(CREATOR_RAW_MEDIA_POLICY.allowedCodecTags);
const BLOCKED_CODEC = new Set<string>(CREATOR_RAW_MEDIA_POLICY.blockedVideoCodecs);
const BLOCKED_TAG = new Set<string>(CREATOR_RAW_MEDIA_POLICY.blockedCodecTags);
const RAW_EXT = new Set<string>(CREATOR_RAW_MEDIA_POLICY.rawCaptureExtensions);

function leafExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const i = base.lastIndexOf(".");
  if (i < 0) return "";
  return base.slice(i + 1).toLowerCase();
}

function baseResult(
  inspected: InspectedMediaStreams,
  contentType: string | null | undefined,
  overrides: Partial<CreatorRawMediaValidationResult>
): CreatorRawMediaValidationResult {
  return {
    ...inspected,
    detectedMime: contentType ? contentType.toLowerCase() : null,
    allowed: false,
    reason: "",
    userMessage: CREATOR_RAW_REJECTION_MESSAGES.notSupported,
    code: "rejected",
    ...overrides,
  };
}

/**
 * Single source of truth: map ffprobe-derived fields + filename/mime hints → allow/deny.
 */
export function classifyCreatorRawMedia(
  inspected: InspectedMediaStreams,
  fileName: string,
  contentType?: string | null
): CreatorRawMediaValidationResult {
  const ext = leafExtension(fileName);

  if (inspected.probeError) {
    return baseResult(inspected, contentType, {
      allowed: false,
      reason: `probe_error:${inspected.probeError}`,
      userMessage: CREATOR_RAW_REJECTION_MESSAGES.probeFailed,
      code: "probe_error",
    });
  }

  if (!inspected.hasVideoStream) {
    return baseResult(inspected, contentType, {
      allowed: false,
      reason: "no_video_stream",
      userMessage: CREATOR_RAW_REJECTION_MESSAGES.noVideoStream,
      code: "no_video_stream",
    });
  }

  const codec = (inspected.detectedVideoCodec ?? "").toLowerCase();
  const tag = (inspected.detectedCodecTag ?? "").toLowerCase();

  if (!codec && !tag) {
    return baseResult(inspected, contentType, {
      allowed: false,
      reason: "unknown_codec",
      userMessage: CREATOR_RAW_REJECTION_MESSAGES.probeFailed,
      code: "unknown_codec",
    });
  }

  /** Match probe: professional fourcc wins before generic blocked codec (`mpeg4` + ProRes tag). */
  if (tag && ALLOWED_TAG.has(tag)) {
    return baseResult(inspected, contentType, {
      allowed: true,
      reason: `allowed_tag:${tag}`,
      userMessage: "",
      code: "allowed_tag",
    });
  }

  if (codec && BLOCKED_CODEC.has(codec)) {
    return baseResult(inspected, contentType, {
      allowed: false,
      reason: `blocked_codec:${codec}`,
      userMessage: CREATOR_RAW_REJECTION_MESSAGES.deliveryCodec,
      code: "delivery_codec",
    });
  }

  if (tag && BLOCKED_TAG.has(tag)) {
    return baseResult(inspected, contentType, {
      allowed: false,
      reason: `blocked_tag:${tag}`,
      userMessage: CREATOR_RAW_REJECTION_MESSAGES.deliveryCodec,
      code: "delivery_fourcc",
    });
  }

  if (codec && ALLOWED_CODEC.has(codec)) {
    return baseResult(inspected, contentType, {
      allowed: true,
      reason: `allowed_codec:${codec}`,
      userMessage: "",
      code: "allowed_codec",
    });
  }

  /**
   * Controlled exception: `.braw` — codec_name varies by ffprobe/build; after a successful probe with
   * a video stream and a non-blocked codec we allow. Renamed delivery files still fail (e.g. h264).
   */
  if (ext === "braw") {
    return baseResult(inspected, contentType, {
      allowed: true,
      reason: `braw_probe_ok:${codec}`,
      userMessage: "",
      code: "braw_verified",
    });
  }

  /** Known cinema capture extensions: fail closed unless codec matched above. */
  if (RAW_EXT.has(ext)) {
    return baseResult(inspected, contentType, {
      allowed: false,
      reason: `raw_ext_unverified_codec:${ext}:${codec}`,
      userMessage: CREATOR_RAW_REJECTION_MESSAGES.notSupported,
      code: "raw_extension_unverified",
    });
  }

  return baseResult(inspected, contentType, {
    allowed: false,
    reason: `codec_not_allowed:${codec}`,
    userMessage: CREATOR_RAW_REJECTION_MESSAGES.notSupported,
    code: "codec_not_allowed",
  });
}

export function isAllowedCreatorRawMedia(
  inspected: InspectedMediaStreams,
  fileName: string,
  contentType?: string | null
): boolean {
  return classifyCreatorRawMedia(inspected, fileName, contentType).allowed;
}
