/**
 * Personal-account Team seat pricing (not Organization seating).
 * Extra seats only; owner includes first seat.
 */

export type PersonalTeamSeatAccess = "none" | "gallery" | "editor" | "fullframe";

export const PERSONAL_TEAM_SEAT_ACCESS_LEVELS: PersonalTeamSeatAccess[] = [
  "none",
  "gallery",
  "editor",
  "fullframe",
];

/** Monthly USD per additional seat at this access tier */
export const TEAM_SEAT_MONTHLY_USD: Record<PersonalTeamSeatAccess, number> = {
  none: 9,
  gallery: 12,
  editor: 14,
  fullframe: 16,
};

export const MAX_EXTRA_PERSONAL_TEAM_SEATS = 9;

export interface TeamSeatCounts {
  none: number;
  gallery: number;
  editor: number;
  fullframe: number;
}

export function emptyTeamSeatCounts(): TeamSeatCounts {
  return { none: 0, gallery: 0, editor: 0, fullframe: 0 };
}

export function sumExtraTeamSeats(c: TeamSeatCounts): number {
  return c.none + c.gallery + c.editor + c.fullframe;
}

/** Max value for `tier` given the other tiers' counts (cap total extra seats). */
export function maxSelectableForTier(
  c: TeamSeatCounts,
  tier: PersonalTeamSeatAccess
): number {
  const others = sumExtraTeamSeats(c) - c[tier];
  return Math.max(0, MAX_EXTRA_PERSONAL_TEAM_SEATS - others);
}

export function teamSeatMonthlySubtotal(c: TeamSeatCounts): number {
  return (
    c.none * TEAM_SEAT_MONTHLY_USD.none +
    c.gallery * TEAM_SEAT_MONTHLY_USD.gallery +
    c.editor * TEAM_SEAT_MONTHLY_USD.editor +
    c.fullframe * TEAM_SEAT_MONTHLY_USD.fullframe
  );
}

/** Annual amount in cents (25% off vs 12 × monthly), matching plan annual pattern */
export function teamSeatAnnualCentsPerSeat(level: PersonalTeamSeatAccess): number {
  const m = TEAM_SEAT_MONTHLY_USD[level];
  return Math.round(m * 12 * 0.75 * 100);
}

export function teamSeatMonthlyCentsPerSeat(level: PersonalTeamSeatAccess): number {
  return Math.round(TEAM_SEAT_MONTHLY_USD[level] * 100);
}

export function isPersonalTeamSeatAccess(s: string): s is PersonalTeamSeatAccess {
  return (
    s === "none" ||
    s === "gallery" ||
    s === "editor" ||
    s === "fullframe"
  );
}

function parseNonNegInt(raw: string | undefined): number {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return 0;
  return Math.min(Math.max(0, parseInt(raw, 10)), MAX_EXTRA_PERSONAL_TEAM_SEATS);
}

/** Read tier counts from Stripe subscription/session metadata */
export function parseTeamSeatCountsFromMetadata(
  metadata: Record<string, string | undefined> | null | undefined
): TeamSeatCounts {
  const m = metadata ?? {};
  return {
    none: parseNonNegInt(m.team_seats_none),
    gallery: parseNonNegInt(m.team_seats_gallery),
    editor: parseNonNegInt(m.team_seats_editor),
    fullframe: parseNonNegInt(m.team_seats_fullframe),
  };
}

/**
 * If tier metadata missing, infer from legacy seat_count only (all extra = base tier).
 */
export function normalizeTeamSeatCountsFromMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
  seatCountFallback?: number
): TeamSeatCounts {
  const parsed = parseTeamSeatCountsFromMetadata(metadata);
  const sum = sumExtraTeamSeats(parsed);
  if (sum > 0) return clampTeamSeatCounts(parsed);

  const sc =
    typeof seatCountFallback === "number" && seatCountFallback >= 1
      ? seatCountFallback
      : 1;
  const extra = Math.max(0, Math.min(sc - 1, MAX_EXTRA_PERSONAL_TEAM_SEATS));
  if (extra <= 0) return emptyTeamSeatCounts();
  return { none: extra, gallery: 0, editor: 0, fullframe: 0 };
}

export function clampTeamSeatCounts(c: TeamSeatCounts): TeamSeatCounts {
  const s: TeamSeatCounts = {
    none: Math.max(0, c.none),
    gallery: Math.max(0, c.gallery),
    editor: Math.max(0, c.editor),
    fullframe: Math.max(0, c.fullframe),
  };
  const order: PersonalTeamSeatAccess[] = ["fullframe", "editor", "gallery", "none"];
  while (sumExtraTeamSeats(s) > MAX_EXTRA_PERSONAL_TEAM_SEATS) {
    for (const k of order) {
      if (s[k] > 0) {
        s[k]--;
        break;
      }
    }
  }
  return s;
}

export function teamSeatCountsToMetadataStrings(c: TeamSeatCounts): Record<string, string> {
  const clamped = clampTeamSeatCounts(c);
  return {
    team_seats_none: String(clamped.none),
    team_seats_gallery: String(clamped.gallery),
    team_seats_editor: String(clamped.editor),
    team_seats_fullframe: String(clamped.fullframe),
    seat_count: String(1 + sumExtraTeamSeats(clamped)),
  };
}

/** Parse request body team seat counts */
export function coerceTeamSeatCounts(input: unknown): TeamSeatCounts {
  if (!input || typeof input !== "object") return emptyTeamSeatCounts();
  const o = input as Record<string, unknown>;
  const n = (k: string) => {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return 0;
    return Math.min(Math.max(0, Math.floor(v)), MAX_EXTRA_PERSONAL_TEAM_SEATS);
  };
  return clampTeamSeatCounts({
    none: n("none"),
    gallery: n("gallery"),
    editor: n("editor"),
    fullframe: n("fullframe"),
  });
}

export type SubscriptionItemWithPrice = {
  deleted?: boolean | null | void;
  quantity?: number | null;
  price?: {
    metadata?: Record<string, string> | null;
  } | null;
};

/** Derive purchased counts from Stripe subscription line items */
export function deriveTeamSeatCountsFromSubscriptionItems(
  items: SubscriptionItemWithPrice[]
): TeamSeatCounts {
  const out = emptyTeamSeatCounts();
  for (const item of items) {
    if (item.deleted) continue;
    const meta = item.price?.metadata ?? {};
    const q = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
    const access = meta.personal_team_seat_access as string | undefined;
    if (access && isPersonalTeamSeatAccess(access)) {
      out[access] += q;
      continue;
    }
    if (meta.type === "seat") {
      out.none += q;
    }
  }
  return clampTeamSeatCounts(out);
}

/**
 * Prefer Stripe subscription items, then tier metadata, then legacy seat_count → base tier extras.
 */
export function resolveTeamSeatCountsForProfile(
  metadata: Record<string, string | undefined>,
  items?: SubscriptionItemWithPrice[]
): TeamSeatCounts {
  if (items?.length) {
    const fromItems = deriveTeamSeatCountsFromSubscriptionItems(items);
    if (sumExtraTeamSeats(fromItems) > 0) return fromItems;
  }
  const fromMeta = parseTeamSeatCountsFromMetadata(metadata);
  if (sumExtraTeamSeats(fromMeta) > 0) return clampTeamSeatCounts(fromMeta);
  const scRaw = metadata.seat_count;
  const sc =
    typeof scRaw === "string" && /^\d+$/.test(scRaw)
      ? parseInt(scRaw, 10)
      : 1;
  const extra = Math.max(0, Math.min(sc - 1, MAX_EXTRA_PERSONAL_TEAM_SEATS));
  if (extra <= 0) return emptyTeamSeatCounts();
  return { none: extra, gallery: 0, editor: 0, fullframe: 0 };
}

export function teamSeatCountsToFirestore(c: TeamSeatCounts): {
  team_seat_counts: TeamSeatCounts;
  seat_count: number;
} {
  const clamped = clampTeamSeatCounts(c);
  return {
    team_seat_counts: clamped,
    seat_count: 1 + sumExtraTeamSeats(clamped),
  };
}

export function formatTeamSeatsSummaryLine(c: TeamSeatCounts): string {
  const parts: string[] = [];
  if (c.none) parts.push(`${c.none} base`);
  if (c.gallery) parts.push(`${c.gallery} Gallery`);
  if (c.editor) parts.push(`${c.editor} Editor`);
  if (c.fullframe) parts.push(`${c.fullframe} Full Frame`);
  if (parts.length === 0) return "1 team seat (owner included)";
  const total = 1 + sumExtraTeamSeats(c);
  return `${total} team seats (${parts.join(", ")})`;
}
