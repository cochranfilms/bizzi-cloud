import { describe, expect, it } from "vitest";
import {
  clampCoverOverlayOpacity,
  getCoverHeroContentLayout,
  getCoverOverlayBackground,
  getPreviewHeroMinHeightPercent,
  resolveCoverHeroPreset,
  resolveCoverObjectPosition,
} from "@/lib/gallery-cover-display";

describe("resolveCoverHeroPreset", () => {
  it("maps null and missing to fullscreen", () => {
    expect(resolveCoverHeroPreset(null)).toBe("fullscreen");
    expect(resolveCoverHeroPreset(undefined)).toBe("fullscreen");
  });

  it("preserves valid stored presets", () => {
    expect(resolveCoverHeroPreset("medium")).toBe("medium");
    expect(resolveCoverHeroPreset("fullscreen")).toBe("fullscreen");
  });

  it("maps unknown strings to fullscreen", () => {
    expect(resolveCoverHeroPreset("")).toBe("fullscreen");
    expect(resolveCoverHeroPreset("invalid")).toBe("fullscreen");
  });
});

describe("getCoverOverlayBackground", () => {
  it("uses solid rgba", () => {
    expect(getCoverOverlayBackground(40, "solid")).toBe("rgba(0,0,0,0.4)");
  });

  it("supports gradient mode", () => {
    const g = getCoverOverlayBackground(100, "gradient");
    expect(g).toContain("linear-gradient");
    expect(g).toContain("rgba(0,0,0");
  });

  it("clamps opacity", () => {
    expect(getCoverOverlayBackground(-10, "solid")).toBe("rgba(0,0,0,0)");
    expect(getCoverOverlayBackground(200, "solid")).toBe("rgba(0,0,0,1)");
  });
});

describe("clampCoverOverlayOpacity", () => {
  it("defaults non-finite to 50", () => {
    expect(clampCoverOverlayOpacity(NaN)).toBe(50);
    expect(clampCoverOverlayOpacity("x" as unknown as number)).toBe(50);
  });
});

describe("resolveCoverObjectPosition", () => {
  it("uses valid focal when both set", () => {
    expect(
      resolveCoverObjectPosition({ cover_focal_x: 30, cover_focal_y: 70 })
    ).toBe("30% 70%");
  });

  it("clamps focal to 0–100", () => {
    expect(
      resolveCoverObjectPosition({ cover_focal_x: -5, cover_focal_y: 500 })
    ).toBe("0% 100%");
  });

  it("ignores NaN focal and falls back to preset", () => {
    expect(
      resolveCoverObjectPosition({
        cover_focal_x: NaN,
        cover_focal_y: 50,
        cover_position: "top",
      })
    ).toBe("50% 0%");
  });

  it("falls back to center when focal invalid and no preset", () => {
    expect(
      resolveCoverObjectPosition({ cover_focal_x: NaN, cover_focal_y: NaN })
    ).toBe("50% 50%");
  });

  it("focal wins over cover_position when valid", () => {
    expect(
      resolveCoverObjectPosition({
        cover_focal_x: 10,
        cover_focal_y: 90,
        cover_position: "center",
      })
    ).toBe("10% 90%");
  });
});

describe("getPreviewHeroMinHeightPercent", () => {
  it("maps vh rules to percent of preview frame", () => {
    expect(getPreviewHeroMinHeightPercent("medium", "mobile")).toBe("60%");
    expect(getPreviewHeroMinHeightPercent("medium", "desktop")).toBe("55%");
  });

  it("fullscreen is 100%", () => {
    expect(getPreviewHeroMinHeightPercent("fullscreen", "mobile")).toBe("100%");
  });
});

describe("getCoverHeroContentLayout", () => {
  it("includes shared width tokens for title stack", () => {
    const c = getCoverHeroContentLayout("center");
    expect(c.stackClassName).toContain("items-center");
    expect(c.stackClassName).toContain("max-w-6xl");
    expect(c.titleClassName).toContain("max-w-3xl");
    expect(c.welcomeClassName).toContain("max-w-xl");
    expect(c.instructionsClassName).toContain("max-w-md");
  });
});
