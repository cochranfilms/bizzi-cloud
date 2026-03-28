/**
 * Pure helpers: power-up / tier entitlements when the user is on a `/team/{ownerUid}` route.
 * Keeps seat tier scoped to the active route so multiple memberships cannot bleed together.
 */

export type PersonalTeamMembershipRow = {
  owner_user_id: string;
  seat_access_level: string;
  status: string;
};

export function parseTeamRouteOwnerUid(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string") return null;
  return /^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() ?? null;
}

export function computeTeamRouteSeatEntitlements(args: {
  pathname: string | null | undefined;
  userUid: string | null | undefined;
  personalTeamMemberships: PersonalTeamMembershipRow[];
  addonIds: string[];
}): {
  useSeatOnlyForPowerUps: boolean;
  hasGallerySuite: boolean;
  hasEditor: boolean;
  teamRouteOwnerUid: string | null;
  effectiveSeatAccess: string | null;
} {
  const teamRouteOwnerUid = parseTeamRouteOwnerUid(args.pathname ?? null);

  const seatRow =
    teamRouteOwnerUid && args.userUid && teamRouteOwnerUid !== args.userUid
      ? args.personalTeamMemberships.find((x) => x.owner_user_id === teamRouteOwnerUid)
      : undefined;

  const useSeatOnlyForPowerUps =
    !!teamRouteOwnerUid &&
    !!args.userUid &&
    teamRouteOwnerUid !== args.userUid &&
    !!seatRow &&
    (seatRow.status === "active" || seatRow.status === "cold_storage");

  const effectiveSeatAccess = seatRow?.seat_access_level ?? null;

  const hasGallerySuite = useSeatOnlyForPowerUps
    ? effectiveSeatAccess === "gallery" || effectiveSeatAccess === "fullframe"
    : args.addonIds.includes("gallery") || args.addonIds.includes("fullframe");

  const hasEditor = useSeatOnlyForPowerUps
    ? effectiveSeatAccess === "editor" || effectiveSeatAccess === "fullframe"
    : args.addonIds.includes("editor") || args.addonIds.includes("fullframe");

  return {
    useSeatOnlyForPowerUps,
    hasGallerySuite,
    hasEditor,
    teamRouteOwnerUid,
    effectiveSeatAccess,
  };
}
