/**
 * Terminal proxy failures for missing or unreachable source objects (not codec / RAW capability).
 * These must not be classified as raw_unsupported or generic transcode errors.
 */
export type ProxySourceInputErrorCode = "source_object_missing" | "source_url_404";

export function isTerminalProxySourceInputError(code: string | undefined): code is ProxySourceInputErrorCode {
  return code === "source_object_missing" || code === "source_url_404";
}
