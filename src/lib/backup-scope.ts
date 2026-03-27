/**
 * Enforces separation between personal, personal-team, and organization storage scopes.
 * Personal: no organization_id and no personal_team_owner_id on drives/files.
 * Personal team container: linked_drives / backup_files scoped with personal_team_owner_id.
 */

type DocData = Record<string, unknown>;

export function isPersonalScopeDriveDoc(data: DocData | undefined): boolean {
  if (!data || data.deleted_at) return false;
  if (data.organization_id != null && data.organization_id !== "") return false;
  if (data.personal_team_owner_id != null && data.personal_team_owner_id !== "") return false;
  return true;
}

export function isTeamContainerDriveDoc(data: DocData | undefined, teamOwnerUid: string): boolean {
  if (!data || data.deleted_at) return false;
  if (data.organization_id != null && data.organization_id !== "") return false;
  return data.personal_team_owner_id === teamOwnerUid;
}

/** Personal workspace files only (not org, not shared team container). */
export function isPersonalScopeFileDoc(data: DocData | undefined): boolean {
  if (!data) return false;
  if (data.organization_id != null && data.organization_id !== "") return false;
  if (data.personal_team_owner_id != null && data.personal_team_owner_id !== "") return false;
  return true;
}

/**
 * Main /dashboard linked_drives + listing: non-org drives the account owner can use alongside solo personal.
 * Includes team-container pillars where personal_team_owner_id === owner (same uid as the drive row).
 */
export function isPersonalDashboardDriveDoc(data: DocData | undefined, ownerUid: string): boolean {
  if (!data || data.deleted_at) return false;
  if (data.organization_id != null && data.organization_id !== "") return false;
  const pto = data.personal_team_owner_id as string | undefined;
  if (pto && pto !== ownerUid) return false;
  return true;
}

/** backup_files visible on personal dashboard for ownerUid (excludes other people's team-scoped rows). */
export function fileVisibleOnPersonalDashboard(data: DocData | undefined, viewerUid: string): boolean {
  if (!data) return false;
  if (data.organization_id != null && data.organization_id !== "") return false;
  const pto = data.personal_team_owner_id as string | undefined;
  if (pto && pto !== viewerUid) return false;
  return true;
}

/**
 * Team workspace files: never org-scoped; must match team owner when pto is set.
 * Rows without pto are allowed when already constrained to team drives (legacy uploads).
 */
export function fileBelongsToPersonalTeamContainer(
  data: DocData | undefined,
  teamOwnerUid: string
): boolean {
  if (!data) return false;
  if (data.organization_id != null && data.organization_id !== "") return false;
  const pto = data.personal_team_owner_id as string | undefined;
  if (pto) return pto === teamOwnerUid;
  return true;
}
