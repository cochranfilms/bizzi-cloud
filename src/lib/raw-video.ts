/**
 * Cinema RAW video classification — single source of truth for UI + thumbnail API contract.
 *
 * Product rule: extensions here are proxy-required, not browser-playable as originals, and must use
 * the video-thumbnail / proxy playback pipeline — never still-RAW (rawToThumbnail) extraction.
 *
 * Plain .dng stays still-photo RAW; do not add dng here until CinemaDNG sequence ingest exists.
 */

import { isVideoFile as isBackupVideoFile } from "@/lib/bizzi-file-types";

/** Safe cinema / single-file RAW video candidates by leaf extension only. */
export const CINEMA_RAW_VIDEO_EXTENSIONS = [
  "braw",
  "r3d",
  "ari",
  "crm",
  "rcd",
  "sir",
] as const;

const CINEMA_RAW_VIDEO_SET = new Set<string>(CINEMA_RAW_VIDEO_EXTENSIONS);

function leafExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const i = base.lastIndexOf(".");
  if (i < 0) return "";
  return base.slice(i + 1).toLowerCase();
}

export function isRawVideoFile(fileNameOrPath: string): boolean {
  const ext = leafExtension(fileNameOrPath);
  return ext !== "" && CINEMA_RAW_VIDEO_SET.has(ext);
}

/** Same as isRawVideoFile for accepted cinema extensions. */
export function requiresProxyPreview(fileNameOrPath: string): boolean {
  return isRawVideoFile(fileNameOrPath);
}

export function isBrowserPlayableOriginal(fileNameOrPath: string): boolean {
  return !isRawVideoFile(fileNameOrPath);
}

/**
 * Use video-thumbnail API, proxy stream, and video card behavior (not still-RAW thumbnail).
 * Includes all backup-classified video extensions plus cinema RAW.
 */
export function shouldUseVideoThumbnailPipeline(fileNameOrPath: string): boolean {
  return isRawVideoFile(fileNameOrPath) || isBackupVideoFile(fileNameOrPath);
}

/** Stable code for 400 responses from still-thumbnail APIs when the client must use video-thumbnail. */
export const RAW_VIDEO_USE_VIDEO_THUMBNAIL_CODE = "raw_video_use_video_thumbnail";
