/**
 * Single predicate for matching "Gallery Media" linked_drive docs to gallery storage scope.
 * Keeps server favorites + client getOrCreateGalleryDrive aligned.
 */

export type GalleryMediaScope =
  | { kind: "personal"; ownerUid: string }
  | { kind: "organization"; ownerUid: string; organizationId: string }
  | { kind: "personal_team"; teamOwnerUid: string };

function normOrg(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

function normPto(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s || null;
}

/** Derive drive lookup scope from a gallery Firestore document. */
export function galleryMediaScopeFromGalleryDoc(gallery: {
  photographer_id?: unknown;
  organization_id?: unknown;
  personal_team_owner_id?: unknown;
}): GalleryMediaScope | null {
  const photographerId =
    typeof gallery.photographer_id === "string" && gallery.photographer_id.trim()
      ? gallery.photographer_id.trim()
      : null;
  if (!photographerId) return null;

  const orgId = normOrg(gallery.organization_id);
  if (orgId) {
    return { kind: "organization", ownerUid: photographerId, organizationId: orgId };
  }

  const pto = normPto(gallery.personal_team_owner_id);
  if (pto) {
    return { kind: "personal_team", teamOwnerUid: pto };
  }

  return { kind: "personal", ownerUid: photographerId };
}

/** `linked_drives` document data (partial). */
export function linkedDriveMatchesGalleryMediaScope(
  data: Record<string, unknown> | undefined,
  scope: GalleryMediaScope
): boolean {
  if (!data || data.deleted_at) return false;
  if (data.name !== "Gallery Media") return false;
  if (data.is_org_shared === true) return false;

  const oid = normOrg(data.organization_id);
  const pto = normPto(data.personal_team_owner_id);
  const rowUid =
    (typeof data.userId === "string" && data.userId) ||
    (typeof data.user_id === "string" && data.user_id) ||
    null;
  if (!rowUid) return false;

  if (scope.kind === "organization") {
    return rowUid === scope.ownerUid && oid === scope.organizationId && !pto;
  }
  if (scope.kind === "personal_team") {
    return rowUid === scope.teamOwnerUid && !oid && pto === scope.teamOwnerUid;
  }
  return rowUid === scope.ownerUid && !oid && !pto;
}
