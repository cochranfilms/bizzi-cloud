import { describe, expect, it } from "vitest";
import { isTerminalProxySourceInputError } from "@/lib/proxy-input-errors";

describe("isTerminalProxySourceInputError", () => {
  it("identifies terminal source codes", () => {
    expect(isTerminalProxySourceInputError("source_object_missing")).toBe(true);
    expect(isTerminalProxySourceInputError("source_url_404")).toBe(true);
    expect(isTerminalProxySourceInputError(undefined)).toBe(false);
    expect(isTerminalProxySourceInputError("decode_failed")).toBe(false);
  });
});

describe("FFmpeg stderr 404 pattern (matches proxy-generation catch)", () => {
  const http404 = /HTTP error 404|404 Not Found|Server returned 404/i;

  it("matches Backblaze / libcurl style lines from user logs", () => {
    expect(http404.test("[https @ 0x41eab880] HTTP error 404")).toBe(true);
    expect(http404.test("Error opening input: Server returned 404 Not Found")).toBe(true);
    expect(http404.test("Error opening input file https://s3.us-east-005.backblazeb2.com/...")).toBe(
      false
    );
  });
});
