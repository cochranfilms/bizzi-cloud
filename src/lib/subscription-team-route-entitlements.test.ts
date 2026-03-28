import { describe, expect, it } from "vitest";
import { computeTeamRouteSeatEntitlements } from "./subscription-team-route-entitlements";

const userUid = "user_abc";

const membershipsTeamATeamB = [
  { owner_user_id: "owner_a", seat_access_level: "fullframe", status: "active" },
  { owner_user_id: "owner_b", seat_access_level: "none", status: "active" },
];

describe("computeTeamRouteSeatEntitlements — seat tier isolated per /team route", () => {
  it("uses Full Frame seat on Team A only when pathname is Team A", () => {
    const onA = computeTeamRouteSeatEntitlements({
      pathname: "/team/owner_a",
      userUid,
      personalTeamMemberships: membershipsTeamATeamB,
      addonIds: [],
    });
    expect(onA.useSeatOnlyForPowerUps).toBe(true);
    expect(onA.hasGallerySuite).toBe(true);
    expect(onA.hasEditor).toBe(true);
    expect(onA.effectiveSeatAccess).toBe("fullframe");
  });

  it("uses base (none) seat on Team B when pathname is Team A → B", () => {
    const onB = computeTeamRouteSeatEntitlements({
      pathname: "/team/owner_b",
      userUid,
      personalTeamMemberships: membershipsTeamATeamB,
      addonIds: [],
    });
    expect(onB.useSeatOnlyForPowerUps).toBe(true);
    expect(onB.hasGallerySuite).toBe(false);
    expect(onB.hasEditor).toBe(false);
    expect(onB.effectiveSeatAccess).toBe("none");
  });

  it("does not bleed Team A fullframe when on Team B despite personal addons", () => {
    const onBWithPersonalAddons = computeTeamRouteSeatEntitlements({
      pathname: "/team/owner_b",
      userUid,
      personalTeamMemberships: membershipsTeamATeamB,
      addonIds: ["gallery", "editor", "fullframe"],
    });
    expect(onBWithPersonalAddons.useSeatOnlyForPowerUps).toBe(true);
    expect(onBWithPersonalAddons.hasGallerySuite).toBe(false);
    expect(onBWithPersonalAddons.hasEditor).toBe(false);
  });

  it("on own team route uses personal addons, not member seats", () => {
    const own = computeTeamRouteSeatEntitlements({
      pathname: `/team/${userUid}`,
      userUid,
      personalTeamMemberships: membershipsTeamATeamB,
      addonIds: ["gallery"],
    });
    expect(own.useSeatOnlyForPowerUps).toBe(false);
    expect(own.hasGallerySuite).toBe(true);
    expect(own.hasEditor).toBe(false);
  });
});
