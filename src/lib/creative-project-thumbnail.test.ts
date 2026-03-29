import { describe, expect, it } from "vitest";
import { resolveCreativeProjectTile, recentFileToCreativeThumbnailSource } from "./creative-project-thumbnail";
import type { RecentFile } from "@/hooks/useCloudFiles";

function rf(partial: Partial<RecentFile> & Pick<RecentFile, "name">): RecentFile {
  const { name, ...rest } = partial;
  return {
    id: "f1",
    name,
    path: name,
    objectKey: "",
    size: 0,
    modifiedAt: null,
    driveId: "d",
    driveName: "D",
    ...rest,
  };
}

describe("resolveCreativeProjectTile", () => {
  it("returns generic for paths inside a macOS package interior", () => {
    const r = resolveCreativeProjectTile({
      name: "Info.plist",
      path: "MyLib.fcpbundle/Contents/Info.plist",
    });
    expect(r).toEqual({ mode: "generic" });
  });

  it("brands Final Cut library package root (synthetic row)", () => {
    const r = resolveCreativeProjectTile({
      name: "MyLib.fcpbundle",
      path: "MyLib.fcpbundle",
      assetType: "macos_package",
      id: "macos-pkg:abc",
      macosPackageKind: "fcpbundle",
    });
    expect(r.mode).toBe("branded_project");
    if (r.mode === "branded_project") {
      expect(r.brandId).toBe("final_cut_pro");
      expect(r.tileVariant).toBe("default");
    }
  });

  it("non-NLE macOS package root stays generic — UI keeps Archive, not a creative tile", () => {
    const r = resolveCreativeProjectTile({
      name: "P.photoslibrary",
      path: "P.photoslibrary",
      assetType: "macos_package",
      id: "macos-pkg:x",
      macosPackageKind: "photoslibrary",
    });
    expect(r).toEqual({ mode: "generic" });
  });

  it("non-NLE macOS package root stays generic even with misleading creativeApp (not branded as NLE)", () => {
    const r = resolveCreativeProjectTile({
      name: "Vacation.photoslibrary",
      path: "Vacation.photoslibrary",
      assetType: "macos_package",
      id: "macos-pkg:photos-1",
      macosPackageKind: "photoslibrary",
      creativeApp: "premiere_pro",
      creativeDisplayLabel: "Premiere Pro project",
      handlingModel: "single_project_file",
      projectFileType: "premiere_prproj",
    });
    expect(r).toEqual({ mode: "generic" });
  });

  it("classifies flat .prproj as Premiere", () => {
    const r = resolveCreativeProjectTile({ name: "p.prproj", path: "p.prproj" });
    expect(r.mode).toBe("branded_project");
    if (r.mode === "branded_project") {
      expect(r.brandId).toBe("premiere_pro");
      expect(r.extensionLabel).toBe(".prproj");
    }
  });

  it("classifies .drp as Resolve default variant", () => {
    const r = resolveCreativeProjectTile({ name: "x.drp", path: "x.drp" });
    expect(r.mode).toBe("branded_project");
    if (r.mode === "branded_project") {
      expect(r.brandId).toBe("davinci_resolve");
      expect(r.tileVariant).toBe("default");
    }
  });

  it("classifies .dra as Resolve archive variant", () => {
    const r = resolveCreativeProjectTile({ name: "x.dra", path: "x.dra" });
    expect(r.mode).toBe("branded_project");
    if (r.mode === "branded_project") {
      expect(r.brandId).toBe("davinci_resolve");
      expect(r.tileVariant).toBe("archive_container");
    }
  });

  it("unknown extension is generic", () => {
    expect(resolveCreativeProjectTile({ name: "a.txt", path: "a.txt" })).toEqual({
      mode: "generic",
    });
  });

  it("prefers server creativeApp over client path classification for non-package rows", () => {
    const r = resolveCreativeProjectTile({
      name: "weird.filename",
      path: "folder/weird.filename",
      creativeApp: "premiere_pro",
      creativeDisplayLabel: "Premiere Pro project",
      handlingModel: "single_project_file",
      projectFileType: "premiere_prproj",
    });
    expect(r.mode).toBe("branded_project");
    if (r.mode === "branded_project") expect(r.brandId).toBe("premiere_pro");
  });

  it("macOS package root ignores misleading server creativeApp (kind wins)", () => {
    const r = resolveCreativeProjectTile({
      name: "Lib.fcpbundle",
      path: "Lib.fcpbundle",
      assetType: "macos_package",
      id: "macos-pkg:1",
      creativeApp: "premiere_pro",
      macosPackageKind: "fcpbundle",
    });
    expect(r.mode).toBe("branded_project");
    if (r.mode === "branded_project") expect(r.brandId).toBe("final_cut_pro");
  });
});

describe("recentFileToCreativeThumbnailSource", () => {
  it("maps RecentFile fields", () => {
    const s = recentFileToCreativeThumbnailSource(
      rf({
        name: "a.prproj",
        creativeApp: "premiere_pro",
        macosPackageKind: null,
      })
    );
    expect(s.name).toBe("a.prproj");
    expect(s.creativeApp).toBe("premiere_pro");
  });
});
