/**
 * Shared client-side policy for video (and generic) galleries — visibility of actions
 * and short copy for summary UI. No delivery_mode branching beyond labels.
 */
import { videoGalleryAllowsClientFileDownloads } from "@/lib/gallery-video-download-policy";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";

export type GalleryPolicyLike = {
  gallery_type?: string | null;
  media_mode?: string | null;
  source_format?: "raw" | "jpg" | null;
  allow_comments?: boolean | null;
  allow_favorites?: boolean | null;
  download_policy?: string | null;
  invoice_required_for_download?: boolean | null;
  invoice_status?: string | null;
  download_settings?: {
    allow_single_download?: boolean;
    allow_full_gallery_download?: boolean;
    allow_selected_download?: boolean;
  } | null;
  delivery_mode?: string | null;
  workflow_status?: string | null;
};

export function isCommentsAllowed(gallery: GalleryPolicyLike | null | undefined): boolean {
  return gallery?.allow_comments !== false;
}

export function isFavoritesAllowed(gallery: GalleryPolicyLike | null | undefined): boolean {
  return gallery?.allow_favorites !== false;
}

export function isAssetDownloadAllowedForClient(
  assetIsDownloadable: boolean | null | undefined
): boolean {
  if (assetIsDownloadable === false) return false;
  return true;
}

export function clientInvoiceBlocksDownload(gallery: GalleryPolicyLike | null | undefined): boolean {
  return !!(gallery?.invoice_required_for_download && gallery?.invoice_status !== "paid");
}

/**
 * High-level file delivery for clients (single/ZIP), before per-asset checks.
 */
export function clientMayDownloadGalleryFiles(
  gallery: GalleryPolicyLike | null | undefined
): boolean {
  if (!gallery) return false;
  const isVideo = gallery.gallery_type === "video";
  const videoOk = !isVideo || videoGalleryAllowsClientFileDownloads(gallery.download_policy);
  return videoOk && !clientInvoiceBlocksDownload(gallery);
}

/** Gallery-level + per-asset gate for client download affordances (null/undefined asset = allow). */
export function clientMayDownloadFiles(
  gallery: GalleryPolicyLike | null | undefined,
  assetIsDownloadable?: boolean | null
): boolean {
  if (!clientMayDownloadGalleryFiles(gallery)) return false;
  return isAssetDownloadAllowedForClient(assetIsDownloadable);
}

export function deliveryModeInfoLabel(deliveryMode: string | null | undefined): string | null {
  switch (deliveryMode) {
    case "video_review":
      return "Client review";
    case "standard_client_gallery":
      return "Client delivery";
    case "private_editor_review":
      return "Editor review";
    default:
      return null;
  }
}

/** Short banner copy for video galleries (no product branching on delivery_mode). */
export function getVideoDeliverySummary(gallery: GalleryPolicyLike | null | undefined): {
  lines: string[];
  mediaModeLabel: string;
} {
  return getVideoExperienceSummaryLines(gallery);
}

export function getVideoExperienceSummaryLines(gallery: GalleryPolicyLike | null | undefined): {
  lines: string[];
  mediaModeLabel: string;
} {
  if (!gallery || gallery.gallery_type !== "video") {
    return { lines: [], mediaModeLabel: "" };
  }
  const mediaMode = normalizeGalleryMediaMode({
    media_mode: (gallery.media_mode as string | null) ?? null,
    source_format: gallery.source_format ?? null,
  });
  const mediaModeLabel = mediaMode === "raw" ? "RAW" : "Final";
  const lines: string[] = [];

  if (clientMayDownloadGalleryFiles(gallery)) {
    lines.push("Downloads may be available for files in this gallery (per clip and settings).");
  } else {
    lines.push("Streaming and on-page preview — file downloads are off or blocked until payment.");
  }
  if (isCommentsAllowed(gallery)) lines.push("Comments are on.");
  else lines.push("Comments are off.");
  if (isFavoritesAllowed(gallery)) lines.push("Saving selects (favorites) is on.");
  else lines.push("Saving selects is off.");

  return { lines, mediaModeLabel };
}

/** Compact labels for video gallery capability strip (quiet UI, no long sentences). */
export function buildVideoGalleryCapabilityPills(
  gallery: GalleryPolicyLike | null | undefined
): string[] {
  if (!gallery || gallery.gallery_type !== "video") return [];

  const pills: string[] = [];
  const mediaMode = normalizeGalleryMediaMode({
    media_mode: (gallery.media_mode as string | null) ?? null,
    source_format: gallery.source_format ?? null,
  });
  if (mediaMode === "raw") pills.push("RAW");

  if (clientInvoiceBlocksDownload(gallery)) {
    pills.push("Downloads locked until payment");
  } else if (!videoGalleryAllowsClientFileDownloads(gallery.download_policy)) {
    pills.push("Stream only");
  } else {
    pills.push("Downloads available");
  }

  pills.push(isCommentsAllowed(gallery) ? "Comments on" : "Comments off");
  pills.push(isFavoritesAllowed(gallery) ? "Selects on" : "Selects off");

  return pills;
}
