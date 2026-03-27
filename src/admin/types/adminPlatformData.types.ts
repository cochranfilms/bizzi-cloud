import type { ActivityEventType } from "@/lib/activity-log";

export type PlatformSummary = {
  workspaceCount: number;
  shareCount: number;
  activityLogsLast24h: number;
  activityLogsTotal: number;
  generatedAt: string;
};

export type AdminWorkspaceRow = {
  id: string;
  name: string;
  workspace_type: string;
  organization_id: string;
  organization_name: string | null;
  drive_id: string | null;
  drive_type: string | null;
  created_by: string;
  member_count: number;
  gallery_id: string | null;
  is_system_workspace: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminShareRow = {
  id: string;
  token: string;
  folder_name: string;
  owner_id: string;
  owner_email: string | null;
  permission: string;
  access_level: string | null;
  recipient_mode: string | null;
  workspace_target: { kind?: string; id?: string } | null;
  target_organization_id: string | null;
  linked_drive_id: string | null;
  backup_file_id: string | null;
  virtual_file_count: number | null;
  expires_at: string | null;
  created_at: string | null;
  is_expired: boolean;
  share_path: string;
};

export type AdminActivityRow = {
  id: string;
  event_type: string;
  actor_user_id: string;
  scope_type: string;
  organization_id: string | null;
  workspace_id: string | null;
  workspace_type: string | null;
  linked_drive_id: string | null;
  drive_type: string | null;
  file_id: string | null;
  folder_id: string | null;
  target_name: string | null;
  target_type: string | null;
  file_path: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

/** Mirrors `ActivityEventType` for filter dropdowns */
export const PLATFORM_ACTIVITY_EVENT_TYPES: ActivityEventType[] = [
  "file_uploaded",
  "folder_created",
  "file_renamed",
  "folder_renamed",
  "file_moved",
  "folder_moved",
  "file_deleted",
  "folder_deleted",
  "file_restored",
  "folder_restored",
  "share_link_created",
  "share_link_removed",
  "bulk_upload_completed",
];
