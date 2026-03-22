/**
 * Maps backend workspace names to user-friendly display labels.
 * UI-only; Firestore names remain unchanged.
 */

export interface WorkspaceForDisplay {
  name?: string;
  workspace_type?: string;
  drive_type?: string | null;
}

/**
 * Returns the user-friendly display label for a workspace.
 * @param workspace - Workspace data (name, workspace_type, drive_type)
 * @param ownerDisplayName - When viewing another member's private workspace (e.g. admin explorer), use their name
 */
export function getDisplayLabel(
  workspace: WorkspaceForDisplay,
  ownerDisplayName?: string | null
): string {
  const type = workspace.workspace_type ?? "private";
  const driveType = (workspace.drive_type ?? "storage") as "storage" | "raw" | "gallery";

  if (type === "org_shared") {
    switch (driveType) {
      case "raw":
        return "Shared RAW";
      case "gallery":
        return "Shared Gallery";
      default:
        return "Shared Library";
    }
  }

  if (type === "private") {
    const prefix = ownerDisplayName ? `${ownerDisplayName}'s ` : "My ";
    switch (driveType) {
      case "raw":
        return `${prefix}Private RAW`;
      case "gallery":
        return `${prefix}Private Gallery Files`;
      default:
        return `${prefix}Private Files`;
    }
  }

  if (type === "team" || type === "project") {
    return workspace.name ?? "Workspace";
  }

  if (type === "gallery") {
    return workspace.name ?? "Gallery Workspace";
  }

  return workspace.name ?? "Workspace";
}

/**
 * Returns helper text describing who can view files in the selected destination.
 */
export function getVisibilityHelperText(
  workspaceType: string,
  scope: "private" | "shared" | "project" | "team"
): string {
  switch (scope) {
    case "private":
      return "Only you and organization admins can view these files.";
    case "shared":
      return "All organization members can view these files.";
    case "project":
    case "team":
      return "Only assigned members and admins can view these files.";
    default:
      return "Only you and organization admins can view these files.";
  }
}
