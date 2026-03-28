import { describe, expect, it } from "vitest";
import {
  buildDisplayMetadata,
  buildFolderDisplayMetadata,
  classifyFileKind,
  SORT_DURATION_NONE,
} from "./metadata-display";
import type { RecentFile } from "@/hooks/useCloudFiles";
import type { FolderItem } from "@/components/dashboard/FolderCard";

function baseFile(partial: Partial<RecentFile> & Pick<RecentFile, "name">): RecentFile {
  return {
    id: "1",
    name: partial.name,
    path: partial.path ?? partial.name,
    objectKey: partial.objectKey ?? "k",
    size: partial.size ?? 1000,
    modifiedAt: partial.modifiedAt ?? null,
    driveId: partial.driveId ?? "d1",
    driveName: partial.driveName ?? "Storage",
    ...partial,
  };
}

describe("classifyFileKind", () => {
  it("treats mp3 as audio", () => {
    expect(classifyFileKind(baseFile({ name: "a.mp3" }))).toBe("audio");
  });
});

describe("buildDisplayMetadata", () => {
  it("uses createdAt when modifiedAt missing", () => {
    const m = buildDisplayMetadata(
      baseFile({
        name: "x.jpg",
        modifiedAt: null,
        createdAt: "2024-06-01T12:00:00.000Z",
      })
    );
    expect(m.modifiedLabel).not.toBe("Recently uploaded");
    expect(m.tooltips?.modified).toContain("2024");
  });

  it("visual media missing dimensions → Not scanned yet", () => {
    const m = buildDisplayMetadata(baseFile({ name: "x.jpg", resolution_w: null, width: null }));
    expect(m.applicability.resolution).toBe("applicable");
    expect(m.resolutionLabel).toBe("Not scanned yet");
  });

  it("pdf codec → Not applicable", () => {
    const m = buildDisplayMetadata(baseFile({ name: "doc.pdf" }));
    expect(m.applicability.codec).toBe("not_applicable");
    expect(m.codecLabel).toBe("Not applicable");
  });

  it("video no duration with pending proxy → Processing", () => {
    const m = buildDisplayMetadata(
      baseFile({ name: "v.mp4", duration_sec: null, proxyStatus: "pending" })
    );
    expect(m.durationLabel).toBe("Processing");
    expect(m.applicability.duration).toBe("applicable");
  });

  it("non-timed file duration → No duration and sentinel sort", () => {
    const m = buildDisplayMetadata(baseFile({ name: "x.pdf" }));
    expect(m.durationLabel).toBe("No duration");
    expect(m.durationSortValue).toBe(SORT_DURATION_NONE);
  });

  it("location uses driveName", () => {
    const m = buildDisplayMetadata(baseFile({ name: "a.jpg", driveName: "RAW" }));
    expect(m.locationLabel).toBe("RAW");
  });

  it("location fallback to Personal Library", () => {
    const m = buildDisplayMetadata(
      baseFile({ name: "a.jpg", driveName: "" }),
      { locationScope: "personal" }
    );
    expect(m.locationLabel).toBe("Personal Library");
  });
});

describe("buildFolderDisplayMetadata", () => {
  const folder = (items: number): FolderItem => ({
    name: "Rock",
    type: "folder",
    key: "k",
    items,
  });

  it("empty folder", () => {
    const m = buildFolderDisplayMetadata({
      item: folder(0),
      coverage: "none",
      descendants: [],
    });
    expect(m.sizeLabel).toBe("Empty folder");
    expect(m.resolutionLabel).toBe("Empty folder");
  });

  it("none coverage shows items only and open for details", () => {
    const m = buildFolderDisplayMetadata({
      item: folder(3),
      coverage: "none",
      descendants: [],
      currentDriveName: "Storage",
    });
    expect(m.sizeLabel).toBe("3 items");
    expect(m.modifiedLabel).toBe("Open folder for details");
  });

  it("partial coverage size has Partial details not fake GB", () => {
    const desc = [
      baseFile({ name: "a.mp4", size: 1e9, duration_sec: 10, video_codec: "h264" }),
      baseFile({ name: "b.jpg", size: 2e6 }),
    ];
    const m = buildFolderDisplayMetadata({
      item: folder(2),
      coverage: "partial",
      descendants: desc,
      currentDriveName: "Storage",
    });
    expect(m.sizeLabel).toContain("Partial details");
    expect(m.sizeLabel).not.toMatch(/GB/);
  });

  it("full coverage shows summed size", () => {
    const desc = [
      baseFile({ name: "a/a.mp4", path: "a/a.mp4", size: 1024 * 1024 }),
      baseFile({ name: "a/b.jpg", path: "a/b.jpg", size: 1024 * 1024 }),
    ];
    const m = buildFolderDisplayMetadata({
      item: folder(2),
      coverage: "full",
      descendants: desc,
    });
    expect(m.sizeLabel).toContain("2 items");
    expect(m.sizeLabel).toMatch(/MB/);
  });
});
