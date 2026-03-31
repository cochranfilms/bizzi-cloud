import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteMuxAsset, deleteMuxAssetWithResult } from "@/lib/mux";

describe("deleteMuxAssetWithResult", () => {
  const origFetch = global.fetch;
  const origId = process.env.MUX_TOKEN_ID;
  const origSecret = process.env.MUX_TOKEN_SECRET;

  beforeEach(() => {
    process.env.MUX_TOKEN_ID = "test-id";
    process.env.MUX_TOKEN_SECRET = "test-secret";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    global.fetch = origFetch;
    process.env.MUX_TOKEN_ID = origId;
    process.env.MUX_TOKEN_SECRET = origSecret;
    vi.unstubAllGlobals();
  });

  it("returns skipped_not_configured when creds missing", async () => {
    delete process.env.MUX_TOKEN_ID;
    const r = await deleteMuxAssetWithResult("mux_1");
    expect(r.outcome).toBe("skipped_not_configured");
  });

  it("treats 204 as deleted", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    const r = await deleteMuxAssetWithResult("mux_1");
    expect(r).toEqual({ outcome: "deleted", httpStatus: 204 });
  });

  it("treats 404 as already_missing", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const r = await deleteMuxAssetWithResult("mux_1");
    expect(r).toEqual({ outcome: "already_missing", httpStatus: 404 });
  });

  it("503 is failed and retryable", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("err", { status: 503 }));
    const r = await deleteMuxAssetWithResult("mux_1");
    expect(r.outcome).toBe("failed");
    if (r.outcome === "failed") {
      expect(r.retryable).toBe(true);
      expect(r.httpStatus).toBe(503);
    }
  });

  it("401 is failed and not retryable", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 401 }));
    const r = await deleteMuxAssetWithResult("mux_1");
    expect(r.outcome).toBe("failed");
    if (r.outcome === "failed") expect(r.retryable).toBe(false);
  });

  it("network error is failed and retryable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ENOTFOUND"));
    const r = await deleteMuxAssetWithResult("mux_1");
    expect(r.outcome).toBe("failed");
    if (r.outcome === "failed") expect(r.retryable).toBe(true);
  });

  it("deleteMuxAsset shim returns true for 204 and 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await deleteMuxAsset("a")).toBe(true);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await deleteMuxAsset("b")).toBe(true);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await deleteMuxAsset("c")).toBe(false);
  });
});
