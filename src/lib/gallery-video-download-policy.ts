/**
 * Video galleries: client file downloads (ZIP / single) are enabled only for `all_assets`.
 * Legacy Firestore values `preview_only` and `selected_assets` are treated as no file downloads.
 */
export function videoGalleryAllowsClientFileDownloads(
  policy: string | null | undefined
): boolean {
  return policy === "all_assets";
}

export function normalizeVideoDownloadPolicyForStorage(
  policy: string | null | undefined
): "none" | "all_assets" {
  if (policy === "all_assets") return "all_assets";
  return "none";
}
