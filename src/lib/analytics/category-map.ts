/**
 * Maps files to Bizzi Cloud storage categories.
 * REAL DATA: Ensure content_type and extension are populated on upload.
 */

import { PROJECT_EXT, ARCHIVE_EXT } from "@/lib/bizzi-file-types";

export interface StorageCategory {
  id: string;
  label: string;
}

const VIDEO_EXT = /\.(mp4|mov|mxf|avi|mkv|webm|m4v|mts|3gp)$/i;
const PHOTO_EXT = /\.(jpg|jpeg|png|webp|heic|tiff|tif)$/i;
const RAW_EXT = /\.(arw|cr2|cr3|nef|raf|dng|orf|rw2|srw|pef)$/i;
const AUDIO_EXT = /\.(wav|mp3|aiff|m4a|aac|flac|ogg)$/i;
const DOC_EXT = /\.(pdf|docx|doc|txt|csv|xlsx|xls|pptx|ppt)$/i;
const LUT_EXT = /\.(cube|lut|xmp)$/i;

export const STORAGE_CATEGORIES: StorageCategory[] = [
  { id: "videos", label: "Videos" },
  { id: "photos", label: "Photos" },
  { id: "raw_photos", label: "RAW Photos" },
  { id: "audio", label: "Audio" },
  { id: "documents", label: "Documents" },
  { id: "projects", label: "Projects" },
  { id: "luts_presets", label: "LUTs / Presets" },
  { id: "archived", label: "Archived Files" },
  { id: "shared", label: "Shared With Others" },
  { id: "trash", label: "Trash" },
  { id: "system", label: "System / Versions / Backups" },
  { id: "other", label: "Other" },
];

export interface FileForCategory {
  id: string;
  name?: string;
  size_bytes: number;
  content_type?: string | null;
  relative_path?: string;
  usage_status?: string | null;
  deleted_at?: unknown;
  /** Set by API when file is in folder_shares */
  isShared?: boolean;
}

function getExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/**
 * Get storage category for a file.
 * Order: Trash → Archived → Shared (if flagged) → content_type/extension → Other
 */
export function getCategoryFromFile(
  file: FileForCategory,
  isShared?: boolean
): string {
  if (file.deleted_at != null) return "trash";
  if (file.usage_status === "archived") return "archived";
  if (isShared ?? file.isShared) return "shared";

  const path = file.relative_path ?? "";
  const ext = getExtension(path);
  const ct = String(file.content_type ?? "").toLowerCase();

  if (VIDEO_EXT.test(path) || ct.startsWith("video/")) return "videos";
  if (RAW_EXT.test(path) || (file as { raw_format?: string }).raw_format)
    return "raw_photos";
  if (PHOTO_EXT.test(path) || ct.startsWith("image/")) return "photos";
  if (AUDIO_EXT.test(path) || ct.startsWith("audio/")) return "audio";
  if (DOC_EXT.test(path) || ct.includes("pdf") || ct.includes("document"))
    return "documents";
  if (PROJECT_EXT.test(path)) return "projects";
  if (ARCHIVE_EXT.test(path)) return "projects";
  if (LUT_EXT.test(path)) return "luts_presets";

  return "other";
}
