/**
 * File metadata types for video and photo filtering.
 * Used by backup_files in Firestore and by the filtering system.
 */

export type MediaType = "video" | "photo" | "other";

export type UsageStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "delivered"
  | "archived";

export type Orientation = "landscape" | "portrait" | "square";

/** Video-specific metadata extracted via ffprobe */
export interface VideoMetadata {
  resolution_w: number;
  resolution_h: number;
  frame_rate: number;
  duration_sec: number;
  video_codec: string;
  container_format: string;
  has_audio: boolean;
  audio_channels: number;
  color_profile: string | null;
  bit_depth: number | null;
}

/** Photo-specific metadata extracted via exiftool */
export interface PhotoMetadata {
  width: number;
  height: number;
  orientation: Orientation;
  raw_format: string | null;
  camera_model: string | null;
  lens_info: string | null;
  color_profile: string | null;
  bit_depth: number | null;
  edited_status: string | null;
}

/** Fields added to backup_files for filtering (all optional for backfill) */
export interface FileMetadataFields {
  media_type?: MediaType | null;
  created_at?: string | null;
  uploader_id?: string | null;
  tags?: string[];
  is_starred?: boolean;
  usage_status?: UsageStatus | null;

  // Video
  resolution_w?: number | null;
  resolution_h?: number | null;
  frame_rate?: number | null;
  duration_sec?: number | null;
  video_codec?: string | null;
  container_format?: string | null;
  has_audio?: boolean | null;
  audio_channels?: number | null;

  // Photo (width/height also used for video resolution)
  width?: number | null;
  height?: number | null;
  orientation?: Orientation | null;
  raw_format?: string | null;
  camera_model?: string | null;
  lens_info?: string | null;

  // Shared
  color_profile?: string | null;
  bit_depth?: number | null;
  edited_status?: string | null;
}
