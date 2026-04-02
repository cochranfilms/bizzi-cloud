import { describe, expect, it } from "vitest";
import { splitFullName } from "./split-full-name";

describe("splitFullName", () => {
  it("splits first and last", () => {
    expect(splitFullName("Ada Lovelace")).toEqual({ firstname: "Ada", lastname: "Lovelace" });
  });
  it("handles single token", () => {
    expect(splitFullName("Madonna")).toEqual({ firstname: "Madonna", lastname: "" });
  });
  it("trims and collapses spaces", () => {
    expect(splitFullName("  Jean-Luc  Picard  ")).toEqual({ firstname: "Jean-Luc", lastname: "Picard" });
  });
});
