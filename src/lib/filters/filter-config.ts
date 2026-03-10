/**
 * Declarative filter configuration for Bizzi Cloud.
 * New filters can be added here without rewriting the UI.
 */

export type FilterType =
  | "multi_select"
  | "range"
  | "date_range"
  | "checkbox"
  | "search";

export type MediaTypeFilter = "video" | "photo";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  id: string;
  label: string;
  type: FilterType;
  /** undefined = universal (all media types) */
  mediaTypes?: MediaTypeFilter[];
  options?: FilterOption[];
  /** Firestore field for server-side filtering */
  field?: string;
  /** For range filters */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/** Universal filters - shown for all media types */
export const UNIVERSAL_FILTERS: FilterDef[] = [
  {
    id: "search",
    label: "Search",
    type: "search",
    field: "relative_path",
  },
  {
    id: "date",
    label: "Date",
    type: "date_range",
    field: "modified_at",
  },
  {
    id: "file_size",
    label: "File size",
    type: "range",
    field: "size_bytes",
    min: 0,
    max: 50 * 1024 * 1024 * 1024, // 50 GB
    step: 1024 * 1024, // 1 MB
    unit: "bytes",
  },
  {
    id: "file_type",
    label: "File type",
    type: "multi_select",
    field: "content_type",
    options: [
      { value: "image/jpeg", label: "JPG" },
      { value: "image/png", label: "PNG" },
      { value: "image/heic", label: "HEIC" },
      { value: "image/tiff", label: "TIFF" },
      { value: "image/webp", label: "WEBP" },
      { value: "video/mp4", label: "MP4" },
      { value: "video/quicktime", label: "MOV" },
      { value: "video/x-msvideo", label: "AVI" },
      { value: "video/x-matroska", label: "MKV" },
    ],
  },
  {
    id: "drive",
    label: "Folder",
    type: "multi_select",
    field: "linked_drive_id",
    options: [], // Populated from user's linked drives
  },
  {
    id: "gallery",
    label: "Gallery",
    type: "multi_select",
    field: "gallery_id",
    options: [], // Populated from user's galleries
  },
  {
    id: "starred",
    label: "Favorite / starred",
    type: "checkbox",
    field: "is_starred",
  },
  {
    id: "usage_status",
    label: "Usage status",
    type: "multi_select",
    field: "usage_status",
    options: [
      { value: "draft", label: "Draft" },
      { value: "in_review", label: "In review" },
      { value: "approved", label: "Approved" },
      { value: "delivered", label: "Delivered" },
      { value: "archived", label: "Archived" },
    ],
  },
  {
    id: "tags",
    label: "Tags / keywords",
    type: "search",
    field: "tags",
  },
  {
    id: "media_type",
    label: "Media type",
    type: "multi_select",
    field: "media_type",
    options: [
      { value: "video", label: "Video" },
      { value: "photo", label: "Photo" },
    ],
  },
];

/** Video-specific filters (Best 10: resolution, aspect, framerate, duration, file type, codec, size, date, color, status) */
export const VIDEO_FILTERS: FilterDef[] = [
  {
    id: "resolution",
    label: "Resolution",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "resolution",
    options: [
      { value: "1280x720", label: "1280×720 (720p)" },
      { value: "1920x1080", label: "1920×1080 (1080p)" },
      { value: "2560x1440", label: "2560×1440 (1440p)" },
      { value: "3840x2160", label: "3840×2160 (4K)" },
      { value: "7680x4320", label: "7680×4320 (8K)" },
    ],
  },
  {
    id: "aspect_ratio",
    label: "Aspect ratio",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "aspect_ratio",
    options: [
      { value: "16:9", label: "16:9" },
      { value: "9:16", label: "9:16" },
      { value: "1:1", label: "1:1" },
      { value: "4:5", label: "4:5" },
      { value: "21:9", label: "21:9" },
    ],
  },
  {
    id: "frame_rate",
    label: "Frame rate",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "frame_rate",
    options: [
      { value: "23.976", label: "23.976 fps" },
      { value: "24", label: "24 fps" },
      { value: "25", label: "25 fps" },
      { value: "29.97", label: "29.97 fps" },
      { value: "30", label: "30 fps" },
      { value: "50", label: "50 fps" },
      { value: "59.94", label: "59.94 fps" },
      { value: "60", label: "60 fps" },
      { value: "120", label: "120 fps" },
    ],
  },
  {
    id: "duration",
    label: "Duration",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "duration_range",
    options: [
      { value: "0-30", label: "Under 30 seconds" },
      { value: "30-120", label: "30 seconds to 2 minutes" },
      { value: "120-600", label: "2 to 10 minutes" },
      { value: "600-1800", label: "10 to 30 minutes" },
      { value: "1800+", label: "30+ minutes" },
    ],
  },
  {
    id: "codec",
    label: "Video codec",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "video_codec",
    options: [
      { value: "h264", label: "H.264" },
      { value: "h265", label: "H.265" },
      { value: "prores", label: "ProRes" },
      { value: "dnxhd", label: "DNxHD" },
      { value: "dnxhr", label: "DNxHR" },
      { value: "braw", label: "BRAW" },
      { value: "redcode", label: "REDCODE" },
      { value: "xavc", label: "XAVC" },
      { value: "av1", label: "AV1" },
    ],
  },
  {
    id: "container",
    label: "Container format",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "container_format",
    options: [
      { value: "mp4", label: "MP4" },
      { value: "mov", label: "MOV" },
      { value: "mxf", label: "MXF" },
      { value: "avi", label: "AVI" },
      { value: "mkv", label: "MKV" },
      { value: "m4v", label: "M4V" },
    ],
  },
  {
    id: "audio",
    label: "Audio",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "has_audio",
    options: [
      { value: "yes", label: "Has audio" },
      { value: "no", label: "No audio" },
    ],
  },
  {
    id: "audio_channels",
    label: "Audio channels",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "audio_channels",
    options: [
      { value: "1", label: "Mono" },
      { value: "2", label: "Stereo" },
      { value: "6", label: "5.1" },
      { value: "8", label: "7.1" },
    ],
  },
  {
    id: "video_color_profile",
    label: "Color profile",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "color_profile",
    options: [
      { value: "rec709", label: "Rec.709" },
      { value: "log", label: "Log" },
      { value: "hdr", label: "HDR" },
    ],
  },
  {
    id: "video_bit_depth",
    label: "Bit depth",
    type: "multi_select",
    mediaTypes: ["video"],
    field: "bit_depth",
    options: [
      { value: "8", label: "8 bit" },
      { value: "10", label: "10 bit" },
      { value: "12", label: "12 bit" },
    ],
  },
];

/** Photo-specific filters (Best 10: resolution, orientation, aspect, file type, raw, size, date, camera, edited, status) */
export const PHOTO_FILTERS: FilterDef[] = [
  {
    id: "photo_resolution",
    label: "Resolution",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "resolution",
    options: [
      { value: "2000x1333", label: "2000×1333" },
      { value: "4000x6000", label: "4000×6000" },
      { value: "6000x4000", label: "6000×4000" },
    ],
  },
  {
    id: "orientation",
    label: "Orientation",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "orientation",
    options: [
      { value: "landscape", label: "Landscape" },
      { value: "portrait", label: "Portrait" },
      { value: "square", label: "Square" },
    ],
  },
  {
    id: "photo_aspect_ratio",
    label: "Aspect ratio",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "aspect_ratio",
    options: [
      { value: "3:2", label: "3:2" },
      { value: "4:3", label: "4:3" },
      { value: "1:1", label: "1:1" },
      { value: "4:5", label: "4:5" },
      { value: "16:9", label: "16:9" },
    ],
  },
  {
    id: "photo_file_type",
    label: "File type",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "content_type",
    options: [
      { value: "image/jpeg", label: "JPG" },
      { value: "image/png", label: "PNG" },
      { value: "image/tiff", label: "TIFF" },
      { value: "image/heic", label: "HEIC" },
      { value: "image/webp", label: "WEBP" },
      { value: "raw", label: "RAW" },
    ],
  },
  {
    id: "raw_format",
    label: "RAW format",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "raw_format",
    options: [
      { value: "cr2", label: "CR2" },
      { value: "cr3", label: "CR3" },
      { value: "nef", label: "NEF" },
      { value: "arw", label: "ARW" },
      { value: "raf", label: "RAF" },
      { value: "orf", label: "ORF" },
      { value: "rw2", label: "RW2" },
      { value: "dng", label: "DNG" },
    ],
  },
  {
    id: "camera_model",
    label: "Camera",
    type: "search",
    mediaTypes: ["photo"],
    field: "camera_model",
  },
  {
    id: "lens",
    label: "Lens",
    type: "search",
    mediaTypes: ["photo"],
    field: "lens_info",
  },
  {
    id: "photo_color_profile",
    label: "Color profile",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "color_profile",
    options: [
      { value: "srgb", label: "sRGB" },
      { value: "adobe_rgb", label: "Adobe RGB" },
      { value: "prophoto_rgb", label: "ProPhoto RGB" },
    ],
  },
  {
    id: "photo_bit_depth",
    label: "Bit depth",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "bit_depth",
    options: [
      { value: "8", label: "8 bit" },
      { value: "16", label: "16 bit" },
    ],
  },
  {
    id: "edited_status",
    label: "Edited status",
    type: "multi_select",
    mediaTypes: ["photo"],
    field: "edited_status",
    options: [
      { value: "raw_only", label: "RAW only" },
      { value: "edited_jpg", label: "Edited JPG" },
      { value: "final_export", label: "Final export" },
      { value: "proof", label: "Proof" },
      { value: "thumbnail", label: "Thumbnail" },
      { value: "social_crop", label: "Social crop" },
    ],
  },
];

/** All filter definitions for lookup */
export const ALL_FILTERS = [
  ...UNIVERSAL_FILTERS,
  ...VIDEO_FILTERS,
  ...PHOTO_FILTERS,
];

/** Get filter def by id */
export function getFilterDef(id: string): FilterDef | undefined {
  return ALL_FILTERS.find((f) => f.id === id);
}

/** Get filters visible for given media type (undefined = show both video and photo) */
export function getFiltersForMediaType(
  mediaType?: MediaTypeFilter
): { universal: FilterDef[]; video: FilterDef[]; photo: FilterDef[] } {
  return {
    universal: UNIVERSAL_FILTERS,
    video: mediaType === "photo" ? [] : VIDEO_FILTERS,
    photo: mediaType === "video" ? [] : PHOTO_FILTERS,
  };
}
