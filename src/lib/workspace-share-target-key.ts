/**
 * Pure helpers for workspace_target_key strings on folder_shares.
 * Safe for client bundles (no firebase-admin).
 */
import type { WorkspaceShareTargetKind } from "@/types/folder-share";

export function workspaceTargetKey(kind: WorkspaceShareTargetKind, id: string): string {
  const trimmed = (id ?? "").trim();
  return `${kind}:${trimmed}`;
}

export function parseWorkspaceTargetKey(
  key: string | undefined | null
): { kind: WorkspaceShareTargetKind; id: string } | null {
  if (!key || typeof key !== "string") return null;
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as WorkspaceShareTargetKind;
  const id = key.slice(idx + 1).trim();
  if (!id) return null;
  if (kind !== "enterprise_workspace" && kind !== "personal_team") return null;
  return { kind, id };
}
