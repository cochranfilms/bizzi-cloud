import { describe, expect, it } from "vitest";
import {
  classifyCreativeFileFromRelativePath,
  isCreativeProjectFilterMatch,
  isLightroomSupportProjectFileType,
} from "./creative-file-registry";

describe("isCreativeProjectFilterMatch", () => {
  it("includes primary Lightroom catalog", () => {
    expect(
      isCreativeProjectFilterMatch({
        handling_model: "single_project_file",
        project_file_type: "lightroom_lrcat",
        creative_app: "lightroom_classic",
      })
    ).toBe(true);
  });

  it("excludes Lightroom .lrdata sidecar", () => {
    expect(
      isCreativeProjectFilterMatch({
        handling_model: "archive_container",
        project_file_type: "lightroom_sidecar",
        creative_app: "lightroom_classic",
      })
    ).toBe(false);
  });

  it("excludes Lightroom SQLite sidecar file types", () => {
    for (const project_file_type of [
      "lightroom_lrcat_wal",
      "lightroom_lrcat_shm",
      "lightroom_lrcat_journal",
    ]) {
      expect(
        isCreativeProjectFilterMatch({
          handling_model: "project_support_file",
          project_file_type,
          creative_app: "lightroom_classic",
        })
      ).toBe(false);
    }
  });

  it("still includes non-Lightroom project_support_file", () => {
    expect(
      isCreativeProjectFilterMatch({
        handling_model: "project_support_file",
        project_file_type: "fcp_event",
        creative_app: "final_cut_pro",
      })
    ).toBe(true);
  });
});

describe("classifyCreativeFileFromRelativePath", () => {
  it("orders lrcat-wal before lrcat", () => {
    const c = classifyCreativeFileFromRelativePath("photos/cat.lrcat-wal");
    expect(c.project_file_type).toBe("lightroom_lrcat_wal");
    expect(c.creative_app).toBe("lightroom_classic");
  });

  it("classifies loose lrcat as primary", () => {
    const c = classifyCreativeFileFromRelativePath("backup/Lightroom Library.lrcat");
    expect(c.project_file_type).toBe("lightroom_lrcat");
    expect(c.creative_app).toBe("lightroom_classic");
  });
});

describe("isLightroomSupportProjectFileType", () => {
  it("detects support types", () => {
    expect(isLightroomSupportProjectFileType("lightroom_sidecar")).toBe(true);
    expect(isLightroomSupportProjectFileType("lightroom_lrcat")).toBe(false);
  });
});
