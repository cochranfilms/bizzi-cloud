/**
 * Workspace types for organization file visibility.
 * Workspaces control who can see files inside org drives.
 */

export type WorkspaceDriveType = "storage" | "raw" | "gallery" | null;

export type WorkspaceType =
  | "private"
  | "org_shared"
  | "team"
  | "project"
  | "gallery";

export type VisibilityScope =
  | "personal"
  | "private_org"
  | "org_shared"
  | "team"
  | "project"
  | "gallery";

export interface Workspace {
  id: string;
  organization_id: string;
  drive_id: string | null;
  drive_type: WorkspaceDriveType;
  name: string;
  workspace_type: WorkspaceType;
  created_by: string;
  member_user_ids: string[];
  team_id: string | null;
  project_id: string | null;
  gallery_id: string | null;
  is_system_workspace: boolean;
  created_at: string;
  updated_at: string;
}
