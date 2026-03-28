export type StorageUsageScopeForDenial =
  | "personal"
  | "personal_team_workspace"
  | "enterprise_workspace";

export type StorageQuotaDenialPayload = {
  requesting_user_id: string;
  billing_subject_user_id: string | null;
  organization_id: string | null;
  usage_scope: StorageUsageScopeForDenial;
  file_used_bytes: number;
  reserved_bytes: number;
  effective_billable_bytes_for_enforcement: number;
  quota_bytes: number;
  additional_bytes: number;
};

export class StorageQuotaDeniedError extends Error {
  readonly code = "storage_quota_denied" as const;

  constructor(
    message: string,
    public readonly storage_denial: StorageQuotaDenialPayload
  ) {
    super(message);
    this.name = "StorageQuotaDeniedError";
  }
}
