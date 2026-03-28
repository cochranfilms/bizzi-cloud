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
  /** Pre-page: optional background music URL */
  pre_page_music_url?: string | null;
  /** Pre-page: custom instructions (favorite, download, purchase) */
  pre_page_instructions?: string | null;
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

/** @deprecated Use creative_lut_config + creative_lut_library */
export interface GalleryLUTSettings {
  enabled: boolean;
  object_key?: string | null;
  storage_url?: string | null;
}

/** Creative LUT library model – up to 5 custom LUTs per gallery */
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "./creative-lut";
export type { CreativeLUTConfig, CreativeLUTLibraryEntry };

/** Gallery type: photo for photographers, video for videographers */
export type GalleryType = "photo" | "video";

/**
 * Delivery profile: Final = edited / preview-friendly delivery; RAW = source camera or log-style review (LUT, etc.).
 * Distinct from gallery_type (photo vs video).
 */
export type MediaMode = "final" | "raw";

/** Video delivery mode – optimizes UI and permissions */
export type VideoDeliveryMode =
  | "standard_client_gallery"   // Showcase, approved download
  | "video_review"              // Watch, heart, comment, request revisions
  | "private_editor_review";    // Stricter, WIP-style

/** Invoice status – external link or manual for V1 */
export type InvoiceStatus =
  | "none"
  | "attached"
  | "sent"
  | "paid"
  | "overdue";

/** Invoice mode – external link preferred for V1 (no Stripe Connect) */
export type InvoiceMode =
  | "external_link"  // Creator pastes hosted invoice/payment URL
  | "manual"         // Creator marks status manually
  | "future_native"; // Reserved for future

/** Video gallery workflow status */
export type VideoWorkflowStatus =
  | "draft"
  | "sent_to_client"
  | "awaiting_feedback"
  | "revisions_in_progress"
  | "awaiting_payment"
  | "approved"
  | "archived";

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

/**
 * Download policy for video galleries.
 * - `none`: preview / streaming only, no file delivery
 * - `all_assets`: full gallery downloads allowed (subject to download_settings + invoice)
 * Legacy stored values `preview_only` | `selected_assets` should be read as unknown until migrated; APIs normalize on write.
 */
export type VideoDownloadPolicy = "none" | "all_assets";

/** Main gallery document (Firestore: galleries) */
export interface Gallery {
  id: string;
  /** photo | video – required for new galleries; legacy default to photo */
  gallery_type?: GalleryType;
  title: string;
  slug: string;                  // URL-safe, unique per photographer
  photographer_id: string;
  cover_asset_id?: string | null;
  /** Asset ID for link preview when sharing gallery (bizzicloud.io/handle/gallery-slug) */
  share_image_asset_id?: string | null;
  /** CSS object-position for banner crop (legacy preset) */
  cover_position?: CoverPosition | null;
  /** Custom focal point: x,y as 0-100 percentages; overrides cover_position when set */
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  /** Alt text for accessibility */
  cover_alt_text?: string | null;
  /** Overlay darkness 0-100 for text readability */
  cover_overlay_opacity?: number | null;
  /** Title alignment on cover: left, center, right */
  cover_title_alignment?: "left" | "center" | "right" | null;
  /** Hero height preset: small, medium, large, cinematic */
  cover_hero_height?: "small" | "medium" | "large" | "cinematic" | null;
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
  /**
   * Delivery profile (authoritative with legacy fallback in APIs via normalizeGalleryMediaMode).
   */
  media_mode?: MediaMode | null;
  /** @deprecated Prefer media_mode. Mirrored as jpg=final, raw=raw for legacy readers */
  source_format?: "raw" | "jpg" | null;
  /** @deprecated Use creative_lut_config + creative_lut_library */
  lut?: GalleryLUTSettings | null;
  /** Creative LUT config and library (preview only, originals unchanged) */
  creative_lut_config?: CreativeLUTConfig | null;
  creative_lut_library?: CreativeLUTLibraryEntry[];
  /** Analytics counters */
  view_count: number;
  unique_visitor_count: number;
  favorite_count: number;
  download_count: number;
  /** Video gallery specific – optional for photo galleries */
  delivery_mode?: VideoDeliveryMode | null;
  download_policy?: VideoDownloadPolicy | null;
  allow_comments?: boolean;
  allow_favorites?: boolean;
  allow_timestamp_comments?: boolean;
  allow_original_downloads?: boolean;
  allow_proxy_downloads?: boolean;
  invoice_mode?: "external_link" | "manual" | "future_native" | null;
  invoice_url?: string | null;
  invoice_label?: string | null;
  invoice_status?: InvoiceStatus | null;
  invoice_required_for_download?: boolean;
  featured_video_asset_id?: string | null;
  client_review_instructions?: string | null;
  workflow_status?: VideoWorkflowStatus | null;
  created_at: string;
  updated_at: string;
}

/** How the row was created — affects delete behavior (linked = remove from gallery only). */
export type GalleryAssetOrigin = "linked" | "gallery_storage";

/** Gallery asset – links backup_file to gallery (Firestore: gallery_assets) */
export interface GalleryAsset {
  id: string;
  gallery_id: string;
  backup_file_id: string;        // Reference to backup_files
  /** linked = added via "From files" (delete only removes gallery row); gallery_storage = uploaded into gallery / Gallery Media */
  asset_origin?: GalleryAssetOrigin;
  object_key: string;
  name: string;
  size_bytes: number;
  media_type: "image" | "video";
  sort_order: number;
  collection_id?: string | null; // Optional sub-group
  is_visible: boolean;           // Hide from client without deleting
  is_hero: boolean;               // Mark as hero/cover candidate
  /** Optional – video metadata */
  duration?: number | null;      // seconds
  resolution?: string | null;     // e.g. "1920x1080"
  thumbnail_url?: string | null;
  proxy_url?: string | null;
  is_downloadable?: boolean;     // Per-asset override for video galleries
  version_number?: number | null;
  version_label?: string | null;
  replaces_asset_id?: string | null;
  is_current_review_version?: boolean;
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

/** Asset comment (Phase 2) – supports optional timestamp for video */
export interface AssetComment {
  id: string;
  gallery_id: string;
  asset_id: string;
  client_email?: string | null;
  client_name?: string | null;
  body: string;
  /** Video: optional timestamp in seconds for context */
  timestamp_seconds?: number | null;
  /** open | addressed | resolved */
  status?: "open" | "addressed" | "resolved" | null;
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
  /** Required – photo or video */
  gallery_type: GalleryType;
  /** When set, gallery belongs to this personal-team workspace (non-enterprise). */
  personal_team_owner_id?: string | null;
  title: string;
  cover_asset_id?: string | null;
  share_image_asset_id?: string | null;
  cover_position?: CoverPosition | null;
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  cover_alt_text?: string | null;
  cover_overlay_opacity?: number | null;
  cover_title_alignment?: "left" | "center" | "right" | null;
  cover_hero_height?: "small" | "medium" | "large" | "cinematic" | null;
  description?: string | null;
  event_date?: string | null;
  expiration_date?: string | null;
  access_mode?: GalleryAccessMode;
  password?: string | null;
  pin?: string | null;
  invited_emails?: string[];
  layout?: GalleryLayout;
  /** final | raw — prefer over legacy source_format */
  media_mode?: MediaMode | null;
  /** @deprecated Use media_mode */
  source_format?: "raw" | "jpg" | null;
  branding?: Partial<GalleryBrandingSettings>;
  download_settings?: Partial<GalleryDownloadSettings>;
  watermark?: Partial<GalleryWatermarkSettings>;
  lut?: Partial<GalleryLUTSettings> | null;
  creative_lut_config?: CreativeLUTConfig | null;
  creative_lut_library?: CreativeLUTLibraryEntry[];
  /** Video gallery specific */
  delivery_mode?: VideoDeliveryMode | null;
  download_policy?: VideoDownloadPolicy | null;
  allow_comments?: boolean;
  allow_favorites?: boolean;
  allow_timestamp_comments?: boolean;
  allow_original_downloads?: boolean;
  allow_proxy_downloads?: boolean;
  invoice_mode?: "external_link" | "manual" | null;
  invoice_url?: string | null;
  invoice_label?: string | null;
  invoice_status?: InvoiceStatus | null;
  invoice_required_for_download?: boolean;
  featured_video_asset_id?: string | null;
  client_review_instructions?: string | null;
  workflow_status?: VideoWorkflowStatus | null;
}

/** Update gallery input – partial. Include version for optimistic locking. */
export interface UpdateGalleryInput extends Partial<CreateGalleryInput> {
  /** Client must send version from latest GET to prevent concurrent overwrites. */
  version?: number;
}

/** Gallery view for client – public-facing payload */
export interface GalleryPublicPayload {
  gallery: {
    id: string;
    gallery_type: GalleryType;
    /** Normalized final vs raw (legacy source_format migrated in API) */
    media_mode: MediaMode;
    title: string;
    slug: string;
    description?: string | null;
    event_date?: string | null;
    layout: GalleryLayout;
    branding: GalleryBrandingSettings;
    download_settings: GalleryDownloadSettings;
    watermark: GalleryWatermarkSettings;
    lut?: { enabled: boolean; storage_url?: string | null } | null;
    creative_lut_config?: CreativeLUTConfig | null;
    creative_lut_library?: CreativeLUTLibraryEntry[];
    cover_asset_id?: string | null;
    /** Video gallery specific */
    featured_video_asset_id?: string | null;
    delivery_mode?: VideoDeliveryMode | null;
    download_policy?: VideoDownloadPolicy | null;
    allow_comments?: boolean;
    allow_favorites?: boolean;
    allow_timestamp_comments?: boolean;
    invoice_required_for_download?: boolean;
    invoice_url?: string | null;
    invoice_label?: string | null;
    invoice_status?: InvoiceStatus | null;
    client_review_instructions?: string | null;
    workflow_status?: VideoWorkflowStatus | null;
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
  duration?: number | null;
  is_downloadable?: boolean;
}
