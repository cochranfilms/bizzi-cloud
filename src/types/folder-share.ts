export type WorkspaceShareTargetKind = "enterprise_workspace" | "personal_team";

export type FolderShareWorkspaceTarget = {
  kind: WorkspaceShareTargetKind;
  id: string;
};
