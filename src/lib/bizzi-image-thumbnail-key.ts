import { createHash } from "crypto";

const VERSION = "v1";

/**
 * Deterministic B2 key for dashboard image list thumbnails (256 / 1024 paths).
 */
export function getImageListThumbnailObjectKey(
  sourceObjectKey: string,
  size: "thumb" | "preview"
): string {
  const hash = createHash("sha256")
    .update(`${sourceObjectKey}:${size}:${VERSION}`)
    .digest("hex")
    .slice(0, 32);
  return `image-thumbnails/${hash}.jpg`;
}
