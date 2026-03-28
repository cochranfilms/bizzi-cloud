/**
 * Shared aspect ratio classes for FileCard and FolderCard.
 * Ensures consistent card dimensions across all layout views and sizes.
 */
import type { AspectRatio } from "@/context/LayoutSettingsContext";

export const CARD_ASPECT_CLASSES: Record<AspectRatio | "video", string> = {
  landscape: "aspect-video", // 16:9
  square: "aspect-square",
  portrait: "aspect-portrait", // 3:4 — theme key in tailwind.config.ts; class must be discoverable (src/lib in content)
  video: "aspect-video", // 16:9 alias
};

export function getCardAspectClass(ratio: AspectRatio | "video" | undefined): string {
  return CARD_ASPECT_CLASSES[ratio ?? "landscape"] ?? "aspect-video";
}
