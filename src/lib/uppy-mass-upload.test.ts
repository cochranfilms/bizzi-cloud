import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXTREME_BATCH_MIN,
  LARGE_BATCH_MIN,
  batchTierRank,
  getAggregateProgressThrottleMs,
  getBatchTierFromCount,
  getGalleryProgressMinIntervalMs,
  getGridProgressThrottleMs,
  getIngestChunkSize,
  maxBatchTier,
} from "@/lib/uppy-mass-upload-constants";
import { runChunkedIngest, yieldToMain } from "@/lib/uppy-chunked-ingest";

describe("uppy-mass-upload-constants", () => {
  it("ranks tiers for maxBatchTier", () => {
    expect(batchTierRank("normal")).toBe(0);
    expect(batchTierRank("large")).toBe(1);
    expect(batchTierRank("extreme")).toBe(2);
    expect(maxBatchTier("normal", "large")).toBe("large");
    expect(maxBatchTier("large", "extreme")).toBe("extreme");
    expect(maxBatchTier("extreme", "normal")).toBe("extreme");
  });

  it("maps counts to batch tiers at documented thresholds", () => {
    expect(getBatchTierFromCount(LARGE_BATCH_MIN - 1)).toBe("normal");
    expect(getBatchTierFromCount(LARGE_BATCH_MIN)).toBe("large");
    expect(getBatchTierFromCount(EXTREME_BATCH_MIN - 1)).toBe("large");
    expect(getBatchTierFromCount(EXTREME_BATCH_MIN)).toBe("extreme");
  });

  it("uses smaller ingest chunks for heavier tiers", () => {
    expect(getIngestChunkSize("normal")).toBeGreaterThan(getIngestChunkSize("large"));
    expect(getIngestChunkSize("large")).toBeGreaterThan(getIngestChunkSize("extreme"));
  });

  it("increases throttle intervals for heavier tiers", () => {
    const tiers = ["normal", "large", "extreme"] as const;
    const agg = tiers.map(getAggregateProgressThrottleMs);
    const grid = tiers.map(getGridProgressThrottleMs);
    const gallery = tiers.map(getGalleryProgressMinIntervalMs);
    expect(agg[0]).toBeLessThan(agg[1]);
    expect(agg[1]).toBeLessThan(agg[2]);
    expect(grid[0]).toBeLessThan(grid[1]);
    expect(grid[1]).toBeLessThan(grid[2]);
    expect(gallery[0]).toBeLessThan(gallery[1]);
    expect(gallery[1]).toBeLessThan(gallery[2]);
  });
});

describe("yieldToMain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to setTimeout when idle + rAF unavailable", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("requestAnimationFrame", undefined);
    const st = vi.fn((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
    vi.stubGlobal("setTimeout", st as unknown as typeof setTimeout);
    await yieldToMain();
    expect(st).toHaveBeenCalled();
  });

  it("uses requestIdleCallback when present", async () => {
    const ric = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });
    vi.stubGlobal("requestIdleCallback", ric);
    await yieldToMain();
    expect(ric).toHaveBeenCalled();
  });
});

describe("runChunkedIngest", () => {
  it("adds files in tier-sized chunks with correct batch sizes", async () => {
    const addFiles = vi.fn();
    const uppy = { addFiles } as unknown as import("@uppy/core").default;
    const files = Array.from({ length: 45 }, (_, i) => new File([`${i}`], `f${i}.txt`));
    const chunkSize = getIngestChunkSize("normal");
    const expectedChunks = Math.ceil(files.length / chunkSize);

    await runChunkedIngest({
      uppy,
      files,
      batchTier: "normal",
      toDescriptors: (slice) => slice.map((f) => ({ name: f.name, data: f })),
    });

    expect(addFiles).toHaveBeenCalledTimes(expectedChunks);
    const batchSizes = addFiles.mock.calls.map((c) => (c[0] as { length: number }).length);
    expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(files.length);
    for (const n of batchSizes) {
      expect(n).toBeLessThanOrEqual(chunkSize);
    }
  });

  it("stops early when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const addFiles = vi.fn();
    const uppy = { addFiles } as unknown as import("@uppy/core").default;
    const files = Array.from({ length: 100 }, (_, i) => new File([`${i}`], `f${i}.txt`));
    const r = await runChunkedIngest({
      uppy,
      files,
      batchTier: "normal",
      signal: ac.signal,
      toDescriptors: (slice) => slice.map((f) => ({ name: f.name, data: f })),
    });
    expect(r.canceled).toBe(true);
    expect(addFiles).not.toHaveBeenCalled();
  });
});
