import { describe, expect, it } from "vitest";
import {
  getDisplayGalleryShareUrl,
  getPreferredGalleryShareAbsoluteUrl,
  getPreferredGallerySharePath,
} from "./gallery-share-url";

describe("getPreferredGallerySharePath", () => {
  it("uses branded path when both slugs present", () => {
    expect(
      getPreferredGallerySharePath({
        publicSlug: "acme",
        gallerySlug: "pool-party",
        galleryId: "abc",
      })
    ).toBe("/acme/pool-party");
  });

  it("falls back to /g/id when handle missing", () => {
    expect(
      getPreferredGallerySharePath({
        publicSlug: null,
        gallerySlug: "pool-party",
        galleryId: "abc",
      })
    ).toBe("/g/abc");
  });

  it("falls back to /g/id when gallery slug missing", () => {
    expect(
      getPreferredGallerySharePath({
        publicSlug: "acme",
        gallerySlug: "",
        galleryId: "abc",
      })
    ).toBe("/g/abc");
  });

  it("trims whitespace", () => {
    expect(
      getPreferredGallerySharePath({
        publicSlug: "  acme  ",
        gallerySlug: "  slug ",
        galleryId: "x",
      })
    ).toBe("/acme/slug");
  });
});

describe("getPreferredGalleryShareAbsoluteUrl", () => {
  it("joins base without double slash", () => {
    expect(
      getPreferredGalleryShareAbsoluteUrl("https://example.com", {
        publicSlug: "a",
        gallerySlug: "b",
        galleryId: "id",
      })
    ).toBe("https://example.com/a/b");
  });

  it("strips trailing slash on base", () => {
    expect(
      getPreferredGalleryShareAbsoluteUrl("https://example.com/", {
        publicSlug: null,
        gallerySlug: "b",
        galleryId: "id",
      })
    ).toBe("https://example.com/g/id");
  });
});

describe("getDisplayGalleryShareUrl", () => {
  it("delegates to absolute helper", () => {
    expect(
      getDisplayGalleryShareUrl({
        origin: "https://bizzicloud.io",
        publicSlug: "u",
        gallerySlug: "g",
        galleryId: "gid",
      })
    ).toBe("https://bizzicloud.io/u/g");
  });
});
