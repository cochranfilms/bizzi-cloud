import { describe, it, expect } from "vitest";
import {
  buildGalleryMediaPathSegmentIndex,
  buildMaterializedListPrefix,
  buildMergeRelativePrefix,
  canonicalGalleryIdForGalleryMediaPath,
  canonicalProofingRootSegment,
  formatGalleryMediaFolderBreadcrumb,
  galleryMediaStorageRootForCanonicalId,
  galleryStoragePathRoots,
  isAcceptedPhotoProofingSegment,
  isAcceptedVideoProofingSegment,
  normalizeProofingRootSegmentForRead,
  relativePathBelongsToGalleryRoots,
  relativePathIsInPhotoProofingTree,
  relativePathIsInGalleryRawArchiveSubfolder,
  relativePathIsInVideoProofingTree,
  resolveGalleryRawVideoArchiveDestinationRelativePath,
  resolveMediaFolderSegmentForPath,
} from "@/lib/gallery-media-path";
import { PROOFING_MERGED_SEGMENT } from "@/lib/gallery-proofing-types";

const sampleGallery = {
  id: "gid-abc",
  media_folder_segment: "spring-wedding",
};

describe("gallery-media-path acceptance (invariants)", () => {
  it("direct upload path uses media_folder_segment + filename (same for personal / team / org)", () => {
    const root = resolveMediaFolderSegmentForPath(
      { title: "My Gallery", media_folder_segment: "my-gallery" },
      sampleGallery.id
    );
    expect(root).toBe("my-gallery");
    expect(`${root}/IMG_001.jpg`).toBe("my-gallery/IMG_001.jpg");
  });

  it("photo proofing prefix uses Favorited + client folder", () => {
    expect(canonicalProofingRootSegment("photo")).toBe("Favorited");
    expect(
      buildMaterializedListPrefix({
        mediaFolderSegment: "my-gallery",
        galleryKind: "photo",
        clientFolderSegment: "jane-doe",
      })
    ).toBe("my-gallery/Favorited/jane-doe");
  });

  it("video proofing prefix uses Selected + client folder", () => {
    expect(canonicalProofingRootSegment("video")).toBe("Selected");
    expect(
      buildMaterializedListPrefix({
        mediaFolderSegment: "my-gallery",
        galleryKind: "video",
        clientFolderSegment: "jane-doe",
      })
    ).toBe("my-gallery/Selected/jane-doe");
  });

  it("merge path uses canonical proofing root + _merged", () => {
    expect(
      buildMergeRelativePrefix({
        mediaFolderSegment: "my-gallery",
        galleryKind: "photo",
        mergeSlug: "merge-xyz",
        mergedSegment: PROOFING_MERGED_SEGMENT,
      })
    ).toBe(`my-gallery/Favorited/${PROOFING_MERGED_SEGMENT}/merge-xyz`);
  });

  it("resolve falls back to slug(title) then gallery id", () => {
    expect(resolveMediaFolderSegmentForPath({ title: "Spring Gala!" }, "g99")).toBe("spring-gala");
    expect(resolveMediaFolderSegmentForPath({}, "g99")).toBe("g99");
  });

  it("legacy proofing segment aliases normalize for reads", () => {
    expect(normalizeProofingRootSegmentForRead("Favorites")).toBe("photo");
    expect(normalizeProofingRootSegmentForRead("favorited")).toBe("photo");
    expect(normalizeProofingRootSegmentForRead("Selects")).toBe("video");
    expect(normalizeProofingRootSegmentForRead("selected")).toBe("video");
    expect(isAcceptedPhotoProofingSegment("Favorites")).toBe(true);
    expect(isAcceptedVideoProofingSegment("Selects")).toBe(true);
  });

  it("galleryStoragePathRoots includes id when segment differs", () => {
    const r = galleryStoragePathRoots(sampleGallery);
    expect(r).toContain("spring-wedding");
    expect(r).toContain("gid-abc");
  });

  it("roots matching for backup relative paths", () => {
    expect(relativePathBelongsToGalleryRoots("spring-wedding/a.jpg", ["spring-wedding", "gid-abc"])).toBe(
      true
    );
    expect(relativePathBelongsToGalleryRoots("gid-abc/a.jpg", ["spring-wedding", "gid-abc"])).toBe(true);
  });

  it("photo proofing tree accepts Favorites and Favorited under canonical or legacy root", () => {
    const g = { id: "gid-abc", media_folder_segment: "spring-wedding" };
    expect(relativePathIsInPhotoProofingTree("spring-wedding/Favorited/c/f.jpg", g)).toBe(true);
    expect(relativePathIsInPhotoProofingTree("gid-abc/Favorites/c/f.jpg", g)).toBe(true);
    expect(relativePathIsInPhotoProofingTree("spring-wedding/Selected/c/f.jpg", g)).toBe(false);
  });

  it("dedupes Gallery Media folder tiles when some rows use gallery_id and others only path segment", () => {
    const galleries = [
      { id: "gid-abc", media_folder_segment: "my-wedding", title: "My Wedding" },
    ];
    const index = buildGalleryMediaPathSegmentIndex(galleries);
    expect(
      canonicalGalleryIdForGalleryMediaPath("my-wedding/clips/a.mov", "gid-abc", index)
    ).toBe("gid-abc");
    expect(
      canonicalGalleryIdForGalleryMediaPath("my-wedding/clips/a.mov", null, index)
    ).toBe("gid-abc");
    expect(galleryMediaStorageRootForCanonicalId("gid-abc", galleries)).toBe("my-wedding");
    expect(formatGalleryMediaFolderBreadcrumb("my-wedding/Selected", galleries)).toBe(
      "My Wedding/Selected"
    );
  });

  it("video proofing tree + gallery RAW archive subfolder (Final conversion archival)", () => {
    const g = { id: "gid-abc", media_folder_segment: "my-gallery" };
    expect(relativePathIsInVideoProofingTree("my-gallery/Selected/jane/take.mov", g)).toBe(true);
    expect(relativePathIsInVideoProofingTree("my-gallery/Selects/jane/take.mov", g)).toBe(true);
    expect(relativePathIsInVideoProofingTree("my-gallery/source/take.mov", g)).toBe(false);
    expect(relativePathIsInGalleryRawArchiveSubfolder("my-gallery/RAW/take.mov", g)).toBe(true);
    expect(relativePathIsInGalleryRawArchiveSubfolder("my-gallery/raw/take.mov", g)).toBe(false);
    expect(resolveGalleryRawVideoArchiveDestinationRelativePath("my-gallery/take.mov", g)).toBe(
      "my-gallery/RAW/take.mov"
    );
    expect(resolveGalleryRawVideoArchiveDestinationRelativePath("my-gallery/sub/take.mov", g)).toBe(
      "my-gallery/RAW/sub/take.mov"
    );
    expect(resolveGalleryRawVideoArchiveDestinationRelativePath("my-gallery/RAW/take.mov", g)).toBe(null);
    expect(resolveGalleryRawVideoArchiveDestinationRelativePath("my-gallery/Selected/x.mov", g)).toBe(
      null
    );
  });
});
