/** Dev or set `localStorage.bizziFilePreviewLutDebug = "1"` for FilePreviewModal / VideoWithLUT LUT diagnostics. */
export function filePreviewLutDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      process.env.NODE_ENV === "development" ||
      window.localStorage?.getItem("bizziFilePreviewLutDebug") === "1"
    );
  } catch {
    return process.env.NODE_ENV === "development";
  }
}

/**
 * Diagnostic: set `localStorage.bizziFilePreviewForceProxyMp4 = "1"` to skip Mux HLS in file preview
 * and play the proxy MP4 only (isolates HLS attach vs LUT).
 */
export function filePreviewForceProxyMp4(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem("bizziFilePreviewForceProxyMp4") === "1";
  } catch {
    return false;
  }
}
