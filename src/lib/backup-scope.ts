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
 * Main /dashboard (non-/team) linked_drives + listings: strict personal pillars only.
 * Team workspace drives belong on /team/{owner}; they must not appear in the personal browser.
 */
export function isPersonalDashboardDriveDoc(data: DocData | undefined, ownerUid: string): boolean {
  if (!isPersonalScopeDriveDoc(data)) return false;
  const rowUid = (data?.userId ?? data?.user_id) as string | undefined;
  return rowUid === ownerUid;
}

/** backup_files visible on the personal dashboard (solo scope — not org, not personal_team). */
export function fileVisibleOnPersonalDashboard(data: DocData | undefined, _viewerUid: string): boolean {
  return isPersonalScopeFileDoc(data);
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
