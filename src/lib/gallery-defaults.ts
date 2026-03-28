import type {
  GalleryBrandingSettings,
  GalleryDownloadSettings,
  GalleryWatermarkSettings,
  VideoDeliveryMode,
  VideoDownloadPolicy,
  VideoWorkflowStatus,
} from "@/types/gallery";

/** Default video gallery settings – used when gallery_type is video */
export const DEFAULT_VIDEO_GALLERY_SETTINGS = {
  delivery_mode: "video_review" as VideoDeliveryMode,
  download_policy: "none" as VideoDownloadPolicy,
  allow_comments: true,
  allow_favorites: true,
  allow_timestamp_comments: false,
  allow_original_downloads: false,
  allow_proxy_downloads: true,
  invoice_mode: null as "external_link" | "manual" | null,
  invoice_url: null as string | null,
  invoice_label: null as string | null,
  invoice_status: "none" as const,
  invoice_required_for_download: false,
  featured_video_asset_id: null as string | null,
  client_review_instructions: null as string | null,
  workflow_status: "draft" as VideoWorkflowStatus,
};

export const DEFAULT_BRANDING: GalleryBrandingSettings = {
  logo_url: null,
  business_name: null,
  accent_color: "#00BFFF",
  background_theme: "warm-beige",
  secondary_color: "#1a1a1a",
  font_family: null,
  welcome_message: null,
  contact_email: null,
  contact_phone: null,
  website_url: null,
  instagram_url: null,
  facebook_url: null,
};

export const DEFAULT_DOWNLOAD_SETTINGS: GalleryDownloadSettings = {
  allow_full_gallery_download: true,
  allow_single_download: true,
  allow_selected_download: true,
  allowed_resolutions: ["low", "web", "full"],
  free_download_limit: null,
  free_download_count_used: 0,
};

export const DEFAULT_WATERMARK: GalleryWatermarkSettings = {
  enabled: false,
  image_url: null,
  position: "bottom-right",
  opacity: 50,
  scale: 1,
};
