import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { parseWorkspaceTargetKey, workspaceTargetKey } from "@/lib/workspace-share-target-key";
import type { WorkspaceShareTargetKind } from "@/types/folder-share";

export type HydratedShareItem = {
  id: string;
  token: string;
  linked_drive_id: string;
  /** Title shown in lists: custom share label when set, else underlying item label */
  folder_name: string;
  /** Trimmed `folder_name` from Firestore when the user chose a custom share title */
  share_label?: string;
  /** File name, drive/folder name, or virtual bundle label (before share-title fallback) */
  backing_item_name: string;
  item_type: "file" | "folder";
  permission: string;
  created_at: string;
  share_url: string;
  invited_emails?: string[];
  recipient_mode?: string;
  workspace_target?: { kind: string; id: string };
  workspace_target_key?: string;
  share_ui_origin?: string;
};

/**
 * Build list item from folder_shares doc; returns null if expired or backing drive/file missing.
 */
export async function hydrateFolderShareDoc(
  db: Firestore,
  d: QueryDocumentSnapshot
): Promise<HydratedShareItem | null> {
  const data = d.data();
  const expiresAt = data.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) return null;

  const referencedFileIds = data.referenced_file_ids as string[] | undefined;
  const isVirtualShare = Array.isArray(referencedFileIds) && referencedFileIds.length > 0;

  let itemName: string;
  let itemType: "file" | "folder";
  let linkedOut: string;

  const rawFolderName = (data.folder_name as string) ?? "";
  const customShareLabel = rawFolderName.trim();

  if (isVirtualShare) {
    const ids = (referencedFileIds ?? []).filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    if (ids.length === 1) {
      const fileSnap = await db.collection("backup_files").doc(ids[0]).get();
      if (fileSnap.exists) {
        const fileData = fileSnap.data();
        if (!fileData?.deleted_at) {
          const path = (fileData?.relative_path ?? "") as string;
          itemName = path.split("/").filter(Boolean).pop() ?? path ?? "File";
        } else {
          itemName = "File";
        }
      } else {
        itemName = "File";
      }
    } else if (ids.length > 1) {
      itemName = `${ids.length} files`;
    } else {
      itemName = "Shared folder";
    }
    itemType = "folder";
    linkedOut = "";
  } else {
    const driveId = (data.linked_drive_id as string)?.trim?.() || "";
    const backupFileId = (data.backup_file_id as string | null | undefined)?.trim?.() || null;
    const isFileShare = !!backupFileId;

    if (!driveId) return null;

    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    if (!driveSnap.exists) return null;

    if (isFileShare && backupFileId) {
      const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
      if (!fileSnap.exists) return null;
      const fileData = fileSnap.data();
      if (fileData?.deleted_at) return null;
      const path = (fileData?.relative_path ?? "") as string;
      itemName = path.split("/").filter(Boolean).pop() ?? path ?? "File";
      itemType = "file";
    } else {
      itemName = driveSnap.data()?.name ?? "Folder";
      itemType = "folder";
    }
    linkedOut = driveId;
  }

  const displayFolderName = customShareLabel || itemName;

  const wt = data.workspace_target as { kind?: string; id?: string } | undefined;
  const rawTargetKey =
    typeof data.workspace_target_key === "string" ? data.workspace_target_key.trim() : "";
  const parsedFromKey = parseWorkspaceTargetKey(rawTargetKey || null);
  const effectiveWorkspaceTarget =
    wt?.kind && wt?.id
      ? { kind: wt.kind as WorkspaceShareTargetKind, id: wt.id }
      : parsedFromKey;
  const isWorkspaceShare =
    data.recipient_mode === "workspace" || !!effectiveWorkspaceTarget;

  const out: HydratedShareItem = {
    id: d.id,
    token: data.token as string,
    linked_drive_id: linkedOut,
    folder_name: displayFolderName,
    backing_item_name: itemName,
    item_type: itemType,
    permission: (data.permission as string) ?? "view",
    created_at: data.created_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    share_url: `/s/${data.token}`,
    invited_emails: (data.invited_emails as string[] | undefined) ?? [],
  };
  if (customShareLabel) {
    out.share_label = customShareLabel;
  }
  if (isWorkspaceShare) {
    out.recipient_mode = "workspace";
    if (rawTargetKey.length > 0) {
      out.workspace_target_key = rawTargetKey;
    } else if (effectiveWorkspaceTarget) {
      out.workspace_target_key = workspaceTargetKey(
        effectiveWorkspaceTarget.kind,
        effectiveWorkspaceTarget.id
      );
    }
    if (effectiveWorkspaceTarget) {
      out.workspace_target = {
        kind: effectiveWorkspaceTarget.kind,
        id: effectiveWorkspaceTarget.id,
      };
    }
  } else {
    out.recipient_mode = "email";
  }
  const suo = data.share_ui_origin as string | undefined;
  if (suo === "dashboard" || suo === "personal_team" || suo === "enterprise") {
    out.share_ui_origin = suo;
  }
  return out;
}
