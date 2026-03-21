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

export type AssetType =
  | "video"
  | "photo"
  | "audio"
  | "document"
  | "project_file"
  | "archive"
  | "generic_asset";

/** Fields added to backup_files for filtering (all optional for backfill) */
export interface FileMetadataFields {
  media_type?: MediaType | null;
  /** Finer-grained classification for project files, archives, etc. */
  asset_type?: AssetType | null;
  /** NLE app: final_cut_pro, premiere_pro, davinci_resolve, after_effects, interchange, archive, unknown_project */
  project_file_type?: string | null;
  /** When false, UI should show "Preview not supported" instead of attempting preview. */
  preview_supported?: boolean | null;
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

  // Proxy (video files only)
  proxy_status?: ProxyStatus | null;
  proxy_object_key?: string | null;
  proxy_size_bytes?: number | null;
  proxy_duration_sec?: number | null;
  proxy_generated_at?: string | null;
  proxy_error_reason?: string | null;
}

export type ProxyStatus =
  | "none"
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "raw_unsupported";
