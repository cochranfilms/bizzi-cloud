import { describe, expect, it } from "vitest";
import { isFolderSelectableDestination } from "./folder-picker-destination";

describe("isFolderSelectableDestination", () => {
  it("allows null root when not excluded", () => {
    expect(
      isFolderSelectableDestination({
        candidateFolderId: null,
        excludedFolderIds: new Set(["a"]),
      }),
    ).toBe(true);
  });

  it("rejects when candidate is in excluded set", () => {
    expect(
      isFolderSelectableDestination({
        candidateFolderId: "self",
        excludedFolderIds: new Set(["self"]),
      }),
    ).toBe(false);
  });

  it("rejects known descendants", () => {
    expect(
      isFolderSelectableDestination({
        candidateFolderId: "child",
        excludedFolderIds: new Set(["mover"]),
        knownDescendantIds: new Set(["child"]),
      }),
    ).toBe(false);
  });
});
