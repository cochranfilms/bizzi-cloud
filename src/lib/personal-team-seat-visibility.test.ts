import { describe, expect, it } from "vitest";
import {
  PERSONAL_TEAM_COLD_STORAGE_MEMBERSHIP_VISIBLE_IN_SWITCHER,
  seatStatusAllowsEnter,
  seatStatusCountsTowardMembershipCap,
  seatStatusShowsInSwitcher,
} from "./personal-team-seat-visibility";

describe("product: cold_storage in workspace switcher", () => {
  it("documents that cold_storage memberships stay visible when flag is true", () => {
    expect(PERSONAL_TEAM_COLD_STORAGE_MEMBERSHIP_VISIBLE_IN_SWITCHER).toBe(true);
    expect(seatStatusShowsInSwitcher("cold_storage")).toBe(true);
  });
});

describe("seatStatusAllowsEnter", () => {
  it("allows active and cold_storage", () => {
    expect(seatStatusAllowsEnter("active")).toBe(true);
    expect(seatStatusAllowsEnter("cold_storage")).toBe(true);
  });
  it("rejects other statuses", () => {
    expect(seatStatusAllowsEnter("invited")).toBe(false);
    expect(seatStatusAllowsEnter("removed")).toBe(false);
    expect(seatStatusAllowsEnter(undefined)).toBe(false);
  });
});

describe("seatStatusCountsTowardMembershipCap", () => {
  it("counts only active", () => {
    expect(seatStatusCountsTowardMembershipCap("active")).toBe(true);
    expect(seatStatusCountsTowardMembershipCap("cold_storage")).toBe(false);
    expect(seatStatusCountsTowardMembershipCap("invited")).toBe(false);
  });
});

describe("seatStatusShowsInSwitcher", () => {
  it("shows active always; cold_storage follows product flag", () => {
    expect(seatStatusShowsInSwitcher("active")).toBe(true);
    expect(seatStatusShowsInSwitcher("cold_storage")).toBe(
      PERSONAL_TEAM_COLD_STORAGE_MEMBERSHIP_VISIBLE_IN_SWITCHER
    );
    expect(seatStatusShowsInSwitcher("removed")).toBe(false);
  });
});
