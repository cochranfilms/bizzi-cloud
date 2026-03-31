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
