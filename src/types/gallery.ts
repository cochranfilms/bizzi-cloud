/**
 * Bizzi Cloud – Photographer gallery types
 * Client galleries, proofing, branding, and delivery
 */

/** How clients access the gallery: public link, password, PIN, or invite-only */
export type GalleryAccessMode =
  | "public"       // Anyone with link
  | "password"     // Requires gallery password
  | "pin"          // Requires download PIN (view allowed, download requires PIN)
  | "invite_only"; // Only invited emails

/** Gallery layout for display */
export type GalleryLayout =
  | "masonry"      // Pinterest-style masonry grid
  | "justified"    // Justified rows (Photos-style)
  | "cinematic";   // Clean cinematic, large images

/** Download resolution offered to clients */
export type DownloadResolution =
  | "low"          // e.g. 1200px
  | "web"          // e.g. 1920px
  | "full";        // Original

/** Watermark placement preset */
export type WatermarkPosition =
  | "center"
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

/** Photographer branding settings (stored on gallery or photographer profile) */
export interface GalleryBrandingSettings {
  logo_url?: string | null;
  business_name?: string | null;
  accent_color?: string | null;   // hex e.g. "#00BFFF"
  /** Gallery background theme id from GALLERY_BACKGROUND_THEMES */
  background_theme?: string | null;
  secondary_color?: string | null;
  font_family?: string | null;   // e.g. "Inter", "Playfair Display"
  welcome_message?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
}

/** Download permission settings */
export interface GalleryDownloadSettings {
  allow_full_gallery_download: boolean;
  allow_single_download: boolean;
  allow_selected_download: boolean;   // Selected favorites only
  allowed_resolutions: DownloadResolution[];
  free_download_limit?: number | null; // null = unlimited
  free_download_count_used?: number;   // Per gallery/client tracking
}

/** Watermark settings – applied to preview only, not delivered files */
export interface GalleryWatermarkSettings {
  enabled: boolean;
  image_url?: string | null;   // Photographer's watermark image URL
  position: WatermarkPosition;
  opacity: number;             // 0–100
  scale?: number;               // 0.5–2 relative size
}

/** Cover photo object-position presets (CSS object-position values) */
export type CoverPosition =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top left"
  | "top right"
  | "bottom left"
  | "bottom right";

/** Main gallery document (Firestore: galleries) */
export interface Gallery {
  id: string;
  title: string;
  slug: string;                  // URL-safe, unique per photographer
  photographer_id: string;
  cover_asset_id?: string | null;
  /** CSS object-position for banner crop (which part of image is visible) */
  cover_position?: CoverPosition | null;
  description?: string | null;
  event_date?: string | null;    // ISO date
  expiration_date?: string | null; // ISO date – when gallery expires
  password_hash?: string | null;  // bcrypt/pbkdf2 if access_mode = password
  pin_hash?: string | null;      // For download PIN if access_mode = pin
  access_mode: GalleryAccessMode;
  invited_emails: string[];
  branding: GalleryBrandingSettings;
  layout: GalleryLayout;
  download_settings: GalleryDownloadSettings;
  watermark: GalleryWatermarkSettings;
  /** Analytics counters */
  view_count: number;
  unique_visitor_count: number;
  favorite_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
}

/** Gallery asset – links backup_file to gallery (Firestore: gallery_assets) */
export interface GalleryAsset {
  id: string;
  gallery_id: string;
  backup_file_id: string;        // Reference to backup_files
  object_key: string;
  name: string;
  size_bytes: number;
  media_type: "image" | "video";
  sort_order: number;
  collection_id?: string | null; // Optional sub-group
  is_visible: boolean;           // Hide from client without deleting
  is_hero: boolean;               // Mark as hero/cover candidate
  created_at: string;
  updated_at: string;
}

/** Collection – optional grouping within a gallery (Firestore: gallery_collections) */
export interface GalleryCollection {
  id: string;
  gallery_id: string;
  title: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Favorites list – client saves favorites (Phase 2) */
export interface FavoritesList {
  id: string;
  gallery_id: string;
  client_email?: string | null;
  client_name?: string | null;
  asset_ids: string[];
  created_at: string;
  updated_at: string;
}

/** Favorite item – individual favorited asset (Phase 2) */
export interface FavoriteItem {
  id: string;
  gallery_id: string;
  asset_id: string;
  favorites_list_id?: string | null;
  client_email?: string | null;
  created_at: string;
}

/** Asset comment (Phase 2) */
export interface AssetComment {
  id: string;
  gallery_id: string;
  asset_id: string;
  client_email?: string | null;
  client_name?: string | null;
  body: string;
  created_at: string;
}

/** Proofing status per asset (Phase 2) */
export type ProofingStatus =
  | "pending"
  | "selected"
  | "editing"
  | "delivered";

/** Create gallery input */
export interface CreateGalleryInput {
  title: string;
  cover_asset_id?: string | null;
  cover_position?: CoverPosition | null;
  description?: string | null;
  event_date?: string | null;
  expiration_date?: string | null;
  access_mode?: GalleryAccessMode;
  password?: string | null;
  pin?: string | null;
  invited_emails?: string[];
  layout?: GalleryLayout;
  branding?: Partial<GalleryBrandingSettings>;
  download_settings?: Partial<GalleryDownloadSettings>;
  watermark?: Partial<GalleryWatermarkSettings>;
}

/** Update gallery input – partial */
export interface UpdateGalleryInput extends Partial<CreateGalleryInput> {}

/** Gallery view for client – public-facing payload */
export interface GalleryPublicPayload {
  gallery: {
    id: string;
    title: string;
    slug: string;
    description?: string | null;
    event_date?: string | null;
    layout: GalleryLayout;
    branding: GalleryBrandingSettings;
    download_settings: GalleryDownloadSettings;
    watermark: GalleryWatermarkSettings;
    cover_asset_id?: string | null;
  };
  collections: GalleryCollection[];
  assets: GalleryAssetPublic[];
}

/** Sanitized asset for public view */
export interface GalleryAssetPublic {
  id: string;
  name: string;
  media_type: "image" | "video";
  collection_id?: string | null;
  sort_order: number;
  thumbnail_url?: string;  // Resolved by client from API
}
