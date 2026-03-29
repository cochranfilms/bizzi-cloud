import { describe, expect, it } from "vitest";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { dedupeLightroomFamilyProjectRows } from "./lightroom-projects-dedupe";

function rf(partial: Partial<RecentFile> & Pick<RecentFile, "id" | "name" | "path" | "driveId">): RecentFile {
  return {
    objectKey: "",
    size: 0,
    modifiedAt: null,
    driveName: "D",
    ...partial,
  };
}

describe("dedupeLightroomFamilyProjectRows", () => {
  it("case 1: .lrlibrary + sibling .lrcat + .lrdata → one primary package row (lrcat duplicate dropped)", () => {
    const rows: RecentFile[] = [
      rf({
        id: "macos-pkg:pkg1",
        name: "Lightroom Library.lrlibrary",
        path: "imports/Lightroom Library.lrlibrary",
        driveId: "d1",
        assetType: "macos_package",
        macosPackageKind: "lrlibrary",
      }),
      rf({
        id: "file-lrcat",
        name: "Lightroom Library.lrcat",
        path: "imports/Lightroom Library.lrcat",
        driveId: "d1",
        projectFileType: "lightroom_lrcat",
        creativeApp: "lightroom_classic",
        handlingModel: "single_project_file",
      }),
    ];
    const out = dedupeLightroomFamilyProjectRows(rows);
    expect(out.map((r) => r.id).sort()).toEqual(["macos-pkg:pkg1"]);
  });

  it("case 2: classic .lrcat + support assets only → single lrcat row remains", () => {
    const rows: RecentFile[] = [
      rf({
        id: "cat",
        name: "My Photos.lrcat",
        path: "classic/My Photos.lrcat",
        driveId: "d1",
        projectFileType: "lightroom_lrcat",
        creativeApp: "lightroom_classic",
        handlingModel: "single_project_file",
      }),
    ];
    expect(dedupeLightroomFamilyProjectRows(rows)).toHaveLength(1);
    expect(dedupeLightroomFamilyProjectRows(rows)[0].id).toBe("cat");
  });
});
