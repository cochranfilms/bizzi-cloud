export function isFolderSelectableDestination(params: {
  candidateFolderId: string | null;
  excludedFolderIds: ReadonlySet<string>;
  knownDescendantIds?: ReadonlySet<string> | undefined;
}): boolean {
  const { candidateFolderId, excludedFolderIds, knownDescendantIds } = params;
  if (candidateFolderId !== null && excludedFolderIds.has(candidateFolderId)) {
    return false;
  }
  if (
    candidateFolderId !== null &&
    knownDescendantIds &&
    knownDescendantIds.has(candidateFolderId)
  ) {
    return false;
  }
  return true;
}
