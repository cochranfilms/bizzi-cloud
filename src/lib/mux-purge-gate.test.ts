import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MuxDeleteResult } from "@/lib/mux";
import {
  assertMuxPurgeTerminalOrThrow,
  MuxPurgeBlockedError,
  MuxPurgeFailedError,
  resetMuxPurgeStrictLogForTests,
  resolveMuxPurgeStrict,
} from "@/lib/mux-purge-gate";

describe("resolveMuxPurgeStrict", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetMuxPurgeStrictLogForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetMuxPurgeStrictLogForTests();
  });

  it("MUX_PURGE_STRICT=true forces strict", () => {
    vi.stubEnv("MUX_PURGE_STRICT", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveMuxPurgeStrict().strict).toBe(true);
    expect(resolveMuxPurgeStrict().source).toBe("env_explicit_true");
  });

  it("MUX_PURGE_STRICT=false forces non-strict", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MUX_PURGE_STRICT", "false");
    expect(resolveMuxPurgeStrict().strict).toBe(false);
    expect(resolveMuxPurgeStrict().source).toBe("env_explicit_false");
  });

  it("unset uses production runtime default", () => {
    vi.stubEnv("MUX_PURGE_STRICT", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    expect(resolveMuxPurgeStrict().strict).toBe(true);
    expect(resolveMuxPurgeStrict().source).toBe("default_production_runtime");
  });

  it("unset non-production defaults non-strict", () => {
    vi.stubEnv("MUX_PURGE_STRICT", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    expect(resolveMuxPurgeStrict().strict).toBe(false);
    expect(resolveMuxPurgeStrict().source).toBe("default_non_production");
  });
});

describe("assertMuxPurgeTerminalOrThrow", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetMuxPurgeStrictLogForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetMuxPurgeStrictLogForTests();
    vi.restoreAllMocks();
  });

  it("allows deleted and already_missing", () => {
    vi.stubEnv("MUX_PURGE_STRICT", "true");
    expect(() =>
      assertMuxPurgeTerminalOrThrow({ outcome: "deleted", httpStatus: 204 }, "x")
    ).not.toThrow();
    expect(() =>
      assertMuxPurgeTerminalOrThrow({ outcome: "already_missing", httpStatus: 404 }, "x")
    ).not.toThrow();
  });

  it("skipped_not_configured throws when strict", () => {
    vi.stubEnv("MUX_PURGE_STRICT", "true");
    expect(() =>
      assertMuxPurgeTerminalOrThrow({ outcome: "skipped_not_configured" }, "asset1")
    ).toThrow(MuxPurgeBlockedError);
  });

  it("skipped_not_configured passes when non-strict", () => {
    vi.stubEnv("MUX_PURGE_STRICT", "false");
    expect(() =>
      assertMuxPurgeTerminalOrThrow({ outcome: "skipped_not_configured" }, "asset1")
    ).not.toThrow();
  });

  it("failed throws MuxPurgeFailedError", () => {
    vi.stubEnv("MUX_PURGE_STRICT", "true");
    const r: MuxDeleteResult = {
      outcome: "failed",
      httpStatus: 503,
      message: "bad",
      retryable: true,
      logHint: "{...}",
    };
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(() => assertMuxPurgeTerminalOrThrow(r, "a1")).toThrow(MuxPurgeFailedError);
  });
});
