/** Enterprise theme preset IDs. */
export type EnterpriseThemeId =
  | "bizzi"
  | "slate"
  | "emerald"
  | "violet"
  | "amber"
  | "rose"
  | "teal";

/** Organization role within an enterprise. */
export type OrganizationRole = "admin" | "member";

/** Seat status - pending until user accepts invite. */
export type SeatStatus = "pending" | "active";

export interface Organization {
  id: string;
  name: string;
  logo_url?: string | null;
  theme: EnterpriseThemeId;
  storage_quota_bytes: number;
  storage_used_bytes?: number;
  max_seats?: number | null;
  /** Power-up add-ons included in the subscription (e.g. ["gallery"], ["editor"], ["fullframe"]) */
  addon_ids?: string[];
  created_at: string;
  created_by: string;
}

/** Per-seat storage allocation. null = Unlimited. */
export type SeatStorageQuotaBytes = number | null;

export interface OrganizationSeat {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  email: string;
  display_name?: string | null;
  invited_at: string;
  accepted_at?: string | null;
  status: SeatStatus;
  /** Per-seat storage limit in bytes. null = Unlimited. */
  storage_quota_bytes?: SeatStorageQuotaBytes;
}

export interface EnterpriseTheme {
  id: EnterpriseThemeId;
  name: string;
  primary: string;
  accent: string;
}
