/**
 * macOS AppleDouble sidecar files (`._name`). They are metadata, not playable media;
 * FFmpeg video thumbnails must ignore them (see `/api/backup/video-thumbnail`, `useVideoThumbnail`).
 * Web uploads still include these when present so `.fcpbundle` restores stay 1:1 with Finder.
 */
export function isAppleDoubleLeafName(fileNameOrRelativePath: string): boolean {
  const leaf =
    fileNameOrRelativePath.split("/").filter(Boolean).pop() ?? fileNameOrRelativePath;
  return leaf.startsWith("._");
}
