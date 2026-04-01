import { describe, expect, it } from "vitest";
import { proxyJobRowIsBrawQueue } from "@/lib/proxy-queue-braw";

describe("proxyJobRowIsBrawQueue", () => {
  it("routes explicit media_worker braw", () => {
    expect(
      proxyJobRowIsBrawQueue({ media_worker: "braw" }, "backups/u/x/file.braw", "file.braw")
    ).toBe(true);
  });

  it("routes legacy rows with .braw leaf and no media_worker", () => {
    expect(proxyJobRowIsBrawQueue({}, "backups/u/x/file.braw", "file.braw")).toBe(true);
  });

  it("does not route standard mp4", () => {
    expect(
      proxyJobRowIsBrawQueue({ media_worker: "standard" }, "backups/u/x/c.mp4", "c.mp4")
    ).toBe(false);
  });

  it("does not route mp4 even without media_worker", () => {
    expect(proxyJobRowIsBrawQueue({}, "backups/u/x/c.mp4", "c.mp4")).toBe(false);
  });
});
