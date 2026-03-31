import { describe, it, expect } from "vitest";
import {
  parseSupportSubmitBody,
  supportSettingsHelpHref,
  parseSupportContextParam,
} from "./support-ticket";

describe("parseSupportSubmitBody", () => {
  it("trims subject and message before validation", () => {
    const r = parseSupportSubmitBody({
      subject: "  abc  ",
      message: "  1234567890  ",
      issueType: "billing",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.subject).toBe("abc");
      expect(r.data.message).toBe("1234567890");
    }
  });

  it("rejects whitespace-only message after trim", () => {
    const r = parseSupportSubmitBody({
      subject: "valid-subject-here",
      message: "     \n\t  ",
      issueType: "other",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects subject over max length", () => {
    const r = parseSupportSubmitBody({
      subject: "x".repeat(201),
      message: "1234567890",
      issueType: "other",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("200");
  });

  it("rejects message over max length", () => {
    const r = parseSupportSubmitBody({
      subject: "abc",
      message: "x".repeat(2001),
      issueType: "other",
    });
    expect(r.ok).toBe(false);
  });

  it("defaults invalid issueType to other", () => {
    const r = parseSupportSubmitBody({
      subject: "abc",
      message: "1234567890",
      issueType: "not-real",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.issueType).toBe("other");
  });
});

describe("supportSettingsHelpHref", () => {
  it("includes section=help and supportContext for each type", () => {
    expect(supportSettingsHelpHref("/dashboard", "support_ticket_submitted")).toContain(
      "/dashboard/settings?section=help&supportContext=submitted"
    );
    expect(supportSettingsHelpHref("/enterprise", "support_ticket_in_progress")).toContain(
      "supportContext=in_progress"
    );
    expect(supportSettingsHelpHref("/desktop/app", "support_ticket_resolved")).toContain(
      "/desktop/app/settings?section=help&supportContext=resolved"
    );
  });
});

describe("parseSupportContextParam", () => {
  it("accepts only valid context values", () => {
    expect(parseSupportContextParam("submitted")).toBe("submitted");
    expect(parseSupportContextParam("bogus")).toBe(null);
  });
});
