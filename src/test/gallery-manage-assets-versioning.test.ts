import { describe, it, expect } from "vitest";
import {
  readAssetsVersion,
  weakEtagForGalleryAssets,
  ifNoneMatchIndicatesUnchanged,
} from "@/lib/gallery-asset-mutations";

describe("gallery manage assets versioning helpers", () => {
  it("readAssetsVersion defaults missing field to 0", () => {
    expect(readAssetsVersion({})).toBe(0);
    expect(readAssetsVersion({ assets_version: 4 })).toBe(4);
  });

  it("weakEtagForGalleryAssets is W/ prefixed", () => {
    expect(weakEtagForGalleryAssets("g1", 3)).toBe(`W/"g=g1;v=3"`);
  });

  it("ifNoneMatchIndicatesUnchanged matches exact weak ETag", () => {
    const etag = weakEtagForGalleryAssets("gal", 2);
    expect(ifNoneMatchIndicatesUnchanged(etag, etag)).toBe(true);
    expect(ifNoneMatchIndicatesUnchanged(`${etag}, W/"other"`, etag)).toBe(true);
    expect(ifNoneMatchIndicatesUnchanged(null, etag)).toBe(false);
    expect(ifNoneMatchIndicatesUnchanged(weakEtagForGalleryAssets("gal", 3), etag)).toBe(false);
  });
});
