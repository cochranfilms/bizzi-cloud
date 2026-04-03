import type { DocumentData } from "firebase-admin/firestore";
import type { StorageDriveType } from "./types";

export function resolveDriveTypeFromLinkedDrive(data: DocumentData): StorageDriveType {
  if (data.is_creator_raw === true) return "raw";
  const name = String(data.name ?? "");
  if (name === "Gallery Media") return "gallery";
  if (data.creator_section === true) return "raw";
  return "storage";
}

/** Scope fields copied onto storage_folders from authoritative linked_drives (or parent folder). */
export interface InheritedScope {
  owner_user_id: string;
  organization_id: string | null;
  personal_team_owner_id: string | null;
  drive_type: StorageDriveType;
  linked_drive_id: string;
}

export function scopeFromLinkedDrive(
  driveId: string,
  data: DocumentData,
): InheritedScope {
  return {
    linked_drive_id: driveId,
    owner_user_id: String(data.userId ?? ""),
    organization_id: (data.organization_id as string | null | undefined) ?? null,
    personal_team_owner_id:
      (data.personal_team_owner_id as string | null | undefined) ?? null,
    drive_type: resolveDriveTypeFromLinkedDrive(data),
  };
}

export function scopeFromParentFolder(
  parent: DocumentData,
  linkedDriveData: DocumentData,
): InheritedScope {
  const driveId = String(parent.linked_drive_id ?? "");
  const fromDrive = scopeFromLinkedDrive(driveId, linkedDriveData);
  return {
    ...fromDrive,
    owner_user_id: String(parent.owner_user_id ?? fromDrive.owner_user_id),
    organization_id:
      (parent.organization_id as string | null | undefined) ?? fromDrive.organization_id,
    personal_team_owner_id:
      (parent.personal_team_owner_id as string | null | undefined) ??
      fromDrive.personal_team_owner_id,
    drive_type:
      (parent.drive_type as StorageDriveType | undefined) ?? fromDrive.drive_type,
  };
}

export function scopesMatchForMove(a: InheritedScope, b: InheritedScope): boolean {
  return (
    a.linked_drive_id === b.linked_drive_id &&
    a.drive_type === b.drive_type &&
    a.owner_user_id === b.owner_user_id &&
    (a.organization_id ?? null) === (b.organization_id ?? null) &&
    (a.personal_team_owner_id ?? null) === (b.personal_team_owner_id ?? null)
  );
}
