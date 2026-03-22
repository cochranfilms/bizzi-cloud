/**
 * Maps workspace_type to visibility_scope for backup_files.
 */
import type { VisibilityScope } from "@/types/workspace";

const MAP: Record<string, VisibilityScope> = {
  org_shared: "org_shared",
  private: "private_org",
  team: "team",
  project: "project",
  gallery: "gallery",
};

const SCOPE_LABELS: Record<string, string> = {
  personal: "Personal",
  private_org: "Private",
  org_shared: "Shared Library",
  team: "Team",
  project: "Project",
  gallery: "Gallery",
};

export function visibilityScopeFromWorkspaceType(type: string): VisibilityScope {
  return MAP[type] ?? "private_org";
}

export function scopeLabelFromScope(scope: VisibilityScope | string): string {
  return SCOPE_LABELS[scope] ?? "Private";
}
