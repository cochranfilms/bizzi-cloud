import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team-constants";

export type FileCommentWorkspaceType = "personal" | "team" | "organization";

export type FileCommentVisibilityScope = "owner_only" | "collaborators" | "share_recipient";

export interface FileCommentScopeFields {
  workspace_type: FileCommentWorkspaceType;
  workspace_id: string;
  organization_id: string | null;
  personal_team_owner_id: string | null;
  file_owner_id: string;
  visibility_scope: FileCommentVisibilityScope;
}

/**
 * UI + POST options for who can see a new comment. Server validates against this list.
 * Personal file owners may choose a narrower or broader scope than the default note.
 */
export function allowedCommentVisibilityOptions(
  fileData: DocumentData | undefined,
  authorUserId: string
): { value: FileCommentVisibilityScope; label: string }[] {
  const scope = deriveFileCommentScope(fileData, authorUserId);
  if (!scope) return [];
  if (scope.workspace_type === "organization" || scope.workspace_type === "team") {
    return [{ value: "collaborators", label: "Workspace members" }];
  }
  if (authorUserId === scope.file_owner_id) {
    return [
      { value: "owner_only", label: "Only me" },
      { value: "share_recipient", label: "Everyone with access" },
    ];
  }
  return [{ value: "share_recipient", label: "Everyone with access" }];
}

export function deriveFileCommentScope(
  fileData: DocumentData | undefined,
  authorUserId: string
): FileCommentScopeFields | null {
  if (!fileData) return null;
  const userId = fileData.userId as string;
  if (!userId) return null;

  const orgId = (fileData.organization_id as string | undefined) ?? null;
  const pto = (fileData.personal_team_owner_id as string | undefined) ?? null;

  let workspace_type: FileCommentWorkspaceType;
  let workspace_id: string;

  if (orgId) {
    workspace_type = "organization";
    workspace_id = orgId;
  } else if (pto) {
    workspace_type = "team";
    workspace_id = pto;
  } else {
    workspace_type = "personal";
    workspace_id = userId;
  }

  let visibility_scope: FileCommentVisibilityScope;
  if (orgId || pto) {
    visibility_scope = "collaborators";
  } else {
    visibility_scope = authorUserId === userId ? "owner_only" : "share_recipient";
  }

  return {
    workspace_type,
    workspace_id,
    organization_id: orgId,
    personal_team_owner_id: pto,
    file_owner_id: userId,
    visibility_scope,
  };
}

/**
 * Snapshot role label for audit / UI (best-effort).
 */
export async function snapshotAuthorRoleForFile(
  authorUserId: string,
  fileData: DocumentData | undefined
): Promise<string | null> {
  if (!fileData) return null;
  const ownerId = fileData.userId as string;
  const orgId = fileData.organization_id as string | undefined;
  const pto = fileData.personal_team_owner_id as string | undefined;

  const db = getAdminFirestore();

  if (orgId) {
    const seat = await db.collection("organization_seats").doc(`${orgId}_${authorUserId}`).get();
    const role = seat.data()?.role as string | undefined;
    return role ?? "member";
  }

  if (pto) {
    if (authorUserId === pto) return "team_owner";
    const seat = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(`${pto}_${authorUserId}`).get();
    const level = seat.data()?.seat_access_level as string | undefined;
    return level ?? "member";
  }

  if (authorUserId === ownerId) return "owner";
  return "share_recipient";
}
