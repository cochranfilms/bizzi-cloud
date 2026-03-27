import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

export type HydratedShareItem = {
  id: string;
  token: string;
  linked_drive_id: string;
  folder_name: string;
  item_type: "file" | "folder";
  permission: string;
  created_at: string;
  share_url: string;
  invited_emails?: string[];
  recipient_mode?: string;
  workspace_target?: { kind: string; id: string };
  workspace_target_key?: string;
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

  if (isVirtualShare) {
    itemName = (data.folder_name as string) ?? "Shared folder";
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

  const wt = data.workspace_target as { kind?: string; id?: string } | undefined;
  const out: HydratedShareItem = {
    id: d.id,
    token: data.token as string,
    linked_drive_id: linkedOut,
    folder_name: itemName,
    item_type: itemType,
    permission: (data.permission as string) ?? "view",
    created_at: data.created_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    share_url: `/s/${data.token}`,
    invited_emails: (data.invited_emails as string[] | undefined) ?? [],
  };
  if (data.recipient_mode === "workspace") {
    out.recipient_mode = "workspace";
    if (data.workspace_target_key) out.workspace_target_key = data.workspace_target_key as string;
    if (wt?.kind && wt?.id) out.workspace_target = { kind: wt.kind, id: wt.id };
  } else {
    out.recipient_mode = "email";
  }
  return out;
}
