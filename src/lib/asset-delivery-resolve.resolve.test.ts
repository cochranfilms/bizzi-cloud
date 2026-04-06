import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProxyObjectKey } from "@/lib/b2";

const flags = vi.hoisted(() => ({
  hints: false,
  headFallback: false,
}));

vi.mock("@/lib/delivery-flags", () => ({
  deliveryUseFirestoreProxyHints: () => flags.hints,
  deliveryHeadFallbackEnabled: () => flags.headFallback,
}));

const objectExists = vi.hoisted(() => vi.fn());

vi.mock("@/lib/b2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/b2")>();
  return {
    ...actual,
    objectExists,
  };
});

import {
  resolveProxyExistsForBackup,
  resolvePreviewInlineEffectiveKey,
} from "@/lib/asset-delivery-resolve";

describe("resolveProxyExistsForBackup", () => {
  beforeEach(() => {
    objectExists.mockReset();
    flags.hints = false;
    flags.headFallback = false;
  });

  it("legacy path always calls objectExists", async () => {
    flags.hints = false;
    objectExists.mockResolvedValue(true);
    const r = await resolveProxyExistsForBackup("content/x/y.jpg", {
      proxy_status: "ready",
      proxy_size_bytes: 500_000,
    });
    expect(r).toEqual({ exists: true, usedHead: true });
    expect(objectExists).toHaveBeenCalledTimes(1);
  });

  it("hints + ready doc skips HEAD when head fallback off", async () => {
    flags.hints = true;
    flags.headFallback = false;
    const r = await resolveProxyExistsForBackup("content/x/y.jpg", {
      proxy_status: "ready",
      proxy_size_bytes: 500_000,
    });
    expect(r).toEqual({ exists: true, usedHead: false });
    expect(objectExists).not.toHaveBeenCalled();
  });

  it("hints + ready doc still HEAD when head fallback on", async () => {
    flags.hints = true;
    flags.headFallback = true;
    objectExists.mockResolvedValue(false);
    const r = await resolveProxyExistsForBackup("content/x/y.jpg", {
      proxy_status: "ready",
      proxy_size_bytes: 500_000,
    });
    expect(r).toEqual({ exists: false, usedHead: true });
    expect(objectExists).toHaveBeenCalledTimes(1);
  });
});

describe("resolvePreviewInlineEffectiveKey", () => {
  beforeEach(() => {
    objectExists.mockReset();
    flags.hints = false;
    flags.headFallback = false;
  });

  it("returns source key when proxy missing", async () => {
    objectExists.mockResolvedValue(false);
    const src = "content/a/b.mov";
    const r = await resolvePreviewInlineEffectiveKey(src, null);
    expect(r.effectiveKey).toBe(src);
    expect(r.usedHead).toBe(true);
  });

  it("returns proxy key when HEAD says exists", async () => {
    objectExists.mockResolvedValue(true);
    const src = "content/a/b.mov";
    const r = await resolvePreviewInlineEffectiveKey(src, null);
    expect(r.effectiveKey).toBe(getProxyObjectKey(src));
    expect(r.usedHead).toBe(true);
  });
});
