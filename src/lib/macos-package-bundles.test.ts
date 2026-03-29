import { describe, expect, it } from "vitest";
import {
  fileListHasMacosPackageInteriorPaths,
  isLikelyFlatMacosPackageBrowserUpload,
  pathLooksLikeInsideMacosPackage,
} from "./macos-package-bundles";

function file(nameBasename: string, webkitRelativePath: string): File {
  return new File([""], nameBasename, {
    lastModified: 0,
    type: "application/octet-stream",
  }) as File & { webkitRelativePath?: string };
}

/** Patch readonly webkitRelativePath for test doubles */
function withRel(f: File, rel: string): File {
  try {
    Object.defineProperty(f, "webkitRelativePath", { value: rel, configurable: true });
  } catch {
    // ignore
  }
  return f;
}

describe("isLikelyFlatMacosPackageBrowserUpload", () => {
  it("treats lone .fcpbundle pick (no relative path) as flat / blocked path", () => {
    const f = withRel(file("Lib.fcpbundle", ""), "");
    expect(isLikelyFlatMacosPackageBrowserUpload(f)).toBe(true);
  });

  it("does not treat lone .lrlibrary pick as flat — allows single-file upload", () => {
    const f = withRel(file("Lightroom Library.lrlibrary", ""), "");
    expect(isLikelyFlatMacosPackageBrowserUpload(f)).toBe(false);
  });

  it("does not flag package member files with paths", () => {
    const f = withRel(file("Info.plist", "Lib.fcpbundle/Contents/Info.plist"), "Lib.fcpbundle/Contents/Info.plist");
    expect(isLikelyFlatMacosPackageBrowserUpload(f)).toBe(false);
  });
});

describe("pathLooksLikeInsideMacosPackage", () => {
  it("detects .lrlibrary interior paths", () => {
    expect(pathLooksLikeInsideMacosPackage("My Lightroom.lrlibrary/internal/x")).toBe(true);
  });
  it("detects .fcpbundle interior paths", () => {
    expect(pathLooksLikeInsideMacosPackage("Lib.fcpbundle/Contents/Info.plist")).toBe(true);
  });
  it("is false for root package filename only", () => {
    expect(pathLooksLikeInsideMacosPackage("My Lightroom.lrlibrary")).toBe(false);
  });
});

describe("fileListHasMacosPackageInteriorPaths", () => {
  it("reads webkitRelativePath when set", () => {
    const f = withRel(file("x", ""), "Cat.lrlibrary/foo/bar");
    expect(fileListHasMacosPackageInteriorPaths([f])).toBe(true);
  });
});
