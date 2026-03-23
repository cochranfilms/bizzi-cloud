/**
 * Creative LUT types - shared across Photo Gallery, Video Gallery, and Creator RAW.
 * Supports up to 5 custom LUTs per scope; builtin LUTs (e.g. Sony Rec 709) are always available.
 */

export type CreativeLUTAppliesTo =
  | "photo_gallery"
  | "video_gallery"
  | "creator_raw_video";

export interface CreativeLUTConfig {
  enabled: boolean;
  selected_lut_id: string | null;
  intensity: number;
  applies_to: CreativeLUTAppliesTo;
  updated_at: string | null;
  updated_by: string | null;
}

export interface CreativeLUTLibraryEntry {
  id: string;
  mode: "builtin" | "custom";
  name: string;
  file_type: "cube";
  file_name: string | null;
  storage_path: string | null;
  signed_url: string | null;
  builtin_lut_id: string | null;
  input_profile: string | null;
  output_profile: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Max custom LUTs per scope. Builtin LUTs do not count toward this limit. */
export const MAX_LUTS_PER_SCOPE = 5;

export const LUT_HELPER_COPY =
  "Creative LUT affects on-screen preview only. Original files remain unchanged. Downloads include original source files.";
