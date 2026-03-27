/**
 * macOS AppleDouble sidecar files (._name) and common junk. They are not user media;
 * treating them as video breaks FFmpeg thumbnails and inflates FCP bundle file counts.
 */
export function isAppleDoubleLeafName(fileNameOrRelativePath: string): boolean {
  const leaf =
    fileNameOrRelativePath.split("/").filter(Boolean).pop() ?? fileNameOrRelativePath;
  return leaf.startsWith("._");
}

export function isSkippableMacosMetadataUpload(fileNameOrRelativePath: string): boolean {
  const leaf =
    fileNameOrRelativePath.split("/").filter(Boolean).pop() ?? fileNameOrRelativePath;
  return leaf.startsWith("._") || leaf === ".DS_Store";
}
