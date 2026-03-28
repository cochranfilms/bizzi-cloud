export type StorageUsageScopeApi =
  | "personal_dashboard"
  | "personal_team_workspace"
  | "enterprise_workspace";

export type StorageQuotaOwnerTypeApi = "user" | "team_owner" | "organization";

/** Launch-safe storage summary for APIs and UI. */
export interface StorageDisplaySummary {
  workspace_used_bytes: number;
  billable_used_bytes: number;
  reserved_bytes: number;
  effective_billable_bytes_for_enforcement: number;
  quota_bytes: number | null;
  /** null when quota is unlimited */
  remaining_bytes: number | null;
  quota_owner_type: StorageQuotaOwnerTypeApi;
  quota_owner_id: string;
  usage_scope: StorageUsageScopeApi;
  breakdown: {
    personal_solo_bytes?: number;
    hosted_team_container_bytes?: number;
    team_workspace_bytes?: number;
  };
  show_upgrade_cta: boolean;
  show_admin_contact_cta: boolean;
}
