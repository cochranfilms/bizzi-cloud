/**
 * Shared helpers for "active workspace" and post-leave identity hints.
 * Enterprise org membership uses a single organization_id on profile.
 */

export function hasActivePersonalWorkspace(personalStatus: string | undefined): boolean {
  return (
    !personalStatus ||
    personalStatus === "active" ||
    personalStatus === "scheduled_delete" ||
    personalStatus === "recoverable"
  );
}

/** User has left their only org; recommend optional full identity cleanup when no personal workspace. */
export function suggestIdentityDeletionAfterOrgLeave(personalStatus: string | undefined): boolean {
  return !hasActivePersonalWorkspace(personalStatus);
}

/**
 * User left a personal team but may still have an enterprise org.
 * Only suggest identity deletion when they have no personal workspace and no org.
 */
export function suggestIdentityDeletionAfterTeamScopeRemoved(
  personalStatus: string | undefined,
  organizationId: string | undefined
): boolean {
  if (organizationId && String(organizationId).trim().length > 0) return false;
  return !hasActivePersonalWorkspace(personalStatus);
}
