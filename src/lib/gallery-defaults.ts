import type {
  GalleryBrandingSettings,
  GalleryDownloadSettings,
  GalleryWatermarkSettings,
} from "@/types/gallery";

export const DEFAULT_BRANDING: GalleryBrandingSettings = {
  logo_url: null,
  business_name: null,
  accent_color: "#00BFFF",
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
