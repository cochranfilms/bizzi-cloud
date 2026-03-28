import { classifyGalleryFilename } from "@/lib/gallery-media-classification";

export type GalleryHealthKind = "photo" | "video";

export interface GalleryHealthInput {
  kind: GalleryHealthKind;
  mediaMode: "final" | "raw";
  assetNames: string[];
  /**
   * For RAW photo: number of LUT library entries when known.
   * Omit (undefined) while loading or when not applicable so LUT advice is skipped.
   */
  lutLibraryCount?: number;
}

export function buildGalleryHealthAdvisories(input: GalleryHealthInput): string[] {
  if (input.kind === "video") return [];
  const photos = input.assetNames.filter((n) => classifyGalleryFilename(n).kind === "photo");
  if (photos.length === 0) return [];
  let rawN = 0;
  let deliveryN = 0;
  for (const n of photos) {
    const c = classifyGalleryFilename(n);
    if (c.isRawPhoto) rawN += 1;
    else deliveryN += 1;
  }
  const total = photos.length;
  const lines: string[] = [];
  if (input.mediaMode === "final" && total >= 3 && rawN >= 2 && rawN / total >= 0.35) {
    lines.push(
      "Many files look like camera RAW. Consider switching to a RAW Photo Gallery in Settings for better previews and review."
    );
  }
  if (input.mediaMode === "raw" && total >= 3 && deliveryN / total >= 0.65) {
    lines.push(
      "Most assets look like delivery stills (JPG/PNG). A Final profile is fine for pure delivery; keep RAW if you rely on LUT preview on select files."
    );
  }
  if (
    input.mediaMode === "raw" &&
    input.lutLibraryCount !== undefined &&
    input.lutLibraryCount === 0 &&
    total > 0
  ) {
    lines.push(
      "No creative LUTs yet. Add LUTs in Gallery settings so clients can preview grades on supported RAW files."
    );
  }
  return lines;
}
