import type { Firestore } from "firebase-admin/firestore";
import { getUploadBillingSnapshot } from "@/lib/enterprise-storage";
import { visibilityScopeFromWorkspaceType } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";

export type MigrationWorkspaceScope = "personal" | "personal_team" | "organization";

export interface MigrationDestinationContract {
  version: 1;
  /** Firebase uid segment in B2 key — same convention as standard uploads (authenticated actor). */
  path_subject_uid: string;
  linked_drive_id: string;
  destination_path_prefix: string;
  workspace_id: string | null;
  workspace_scope: MigrationWorkspaceScope;
  organization_id: string | null;
  personal_team_owner_id: string | null;
  visibility_scope: string;
  drive_name_snapshot: string;
  billing_key: string;
  quota_subject_uid: string;
  destination_validated_at: string;
}

export type MigrationDestinationErrorCode =
  | "MIGRATION_DEST_DRIVE_NOT_FOUND"
  | "MIGRATION_DEST_RAW_FORBIDDEN"
  | "MIGRATION_DEST_GALLERY_FORBIDDEN"
  | "MIGRATION_DEST_NOT_STORAGE"
  | "MIGRATION_DEST_WORKSPACE_REQUIRED"
  | "MIGRATION_DEST_WORKSPACE_NOT_FOUND"
  | "MIGRATION_DEST_WORKSPACE_DRIVE_MISMATCH"
  | "MIGRATION_DEST_NO_WRITE"
  | "MIGRATION_DEST_ACCESS_DENIED";

function isAllowedStorageName(name: string): boolean {
  return name === "Storage" || name === "Uploads";
}

export type ResolveMigrationDestinationResult =
  | { ok: true; contract: MigrationDestinationContract }
  | { ok: false; code: MigrationDestinationErrorCode; status: number; message: string };

/**
 * Validate Storage-only destination (never RAW / Gallery Media) and build immutable contract for the job.
 */
export async function resolveMigrationDestinationContract(
  db: Firestore,
  input: {
    uid: string;
    driveId: string;
    destinationPathPrefix: string;
    workspaceId: string | null;
  }
): Promise<ResolveMigrationDestinationResult> {
  const { uid, driveId, workspaceId: workspaceIdRaw } = input;
  const destination_path_prefix = input.destinationPathPrefix
    .replace(/^\/+/, "")
    .replace(/\.\./g, "")
    .trim();

  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  if (!driveSnap.exists) {
    return {
      ok: false,
      code: "MIGRATION_DEST_DRIVE_NOT_FOUND",
      status: 404,
      message: "Destination drive not found.",
    };
  }
  const d = driveSnap.data()!;
  if (d.deleted_at != null) {
    return {
      ok: false,
      code: "MIGRATION_DEST_DRIVE_NOT_FOUND",
      status: 400,
      message: "Destination drive is deleted.",
    };
  }
  if (d.is_creator_raw === true) {
    return {
      ok: false,
      code: "MIGRATION_DEST_RAW_FORBIDDEN",
      status: 400,
      message: "Cannot migrate into RAW. Choose Storage or a folder under Storage.",
    };
  }
  const driveName = (d.name as string | undefined)?.trim() ?? "";
  if (driveName === "Gallery Media" || driveName.toLowerCase() === "gallery media") {
    return {
      ok: false,
      code: "MIGRATION_DEST_GALLERY_FORBIDDEN",
      status: 400,
      message: "Cannot migrate into Gallery Media.",
    };
  }
  if (!isAllowedStorageName(driveName)) {
    return {
      ok: false,
      code: "MIGRATION_DEST_NOT_STORAGE",
      status: 400,
      message: "Migration is allowed only into the main Storage drive (or legacy Uploads).",
    };
  }

  const driveOrgId =
    typeof d.organization_id === "string" && d.organization_id.trim() ? d.organization_id.trim() : null;
  const workspaceId =
    workspaceIdRaw && String(workspaceIdRaw).trim() ? String(workspaceIdRaw).trim() : null;

  let workspace_scope: MigrationWorkspaceScope;
  let organization_id: string | null = null;
  let personal_team_owner_id: string | null = null;
  let visibility_scope: string;

  if (driveOrgId) {
    if (!workspaceId) {
      return {
        ok: false,
        code: "MIGRATION_DEST_WORKSPACE_REQUIRED",
        status: 400,
        message: "organization_workspace_id is required for organization Storage destinations.",
      };
    }
    const wsSnap = await db.collection("workspaces").doc(workspaceId).get();
    if (!wsSnap.exists) {
      return {
        ok: false,
        code: "MIGRATION_DEST_WORKSPACE_NOT_FOUND",
        status: 404,
        message: "Workspace not found.",
      };
    }
    const ws = wsSnap.data()!;
    const wsOrg = typeof ws.organization_id === "string" ? ws.organization_id : null;
    if (!wsOrg || wsOrg !== driveOrgId) {
      return {
        ok: false,
        code: "MIGRATION_DEST_WORKSPACE_DRIVE_MISMATCH",
        status: 400,
        message: "Workspace does not match this organization drive.",
      };
    }
    const canWrite = await userCanWriteWorkspace(uid, workspaceId);
    if (!canWrite) {
      return {
        ok: false,
        code: "MIGRATION_DEST_NO_WRITE",
        status: 403,
        message: "No write access to this workspace.",
      };
    }
    workspace_scope = "organization";
    organization_id = driveOrgId;
    personal_team_owner_id = null;
    visibility_scope = visibilityScopeFromWorkspaceType((ws.workspace_type as string) ?? "private");
  } else {
    if (workspaceId) {
      return {
        ok: false,
        code: "MIGRATION_DEST_WORKSPACE_DRIVE_MISMATCH",
        status: 400,
        message: "This Storage drive is personal; do not send an organization workspace id.",
      };
    }

    const ptoRaw = d.personal_team_owner_id;
    const pto =
      typeof ptoRaw === "string" && ptoRaw.trim() ? ptoRaw.trim() : null;
    const ownerUid =
      typeof d.userId === "string"
        ? d.userId
        : typeof d.user_id === "string"
          ? d.user_id
          : null;

    if (pto) {
      workspace_scope = "personal_team";
      personal_team_owner_id = pto;
    } else if (ownerUid === uid) {
      workspace_scope = "personal";
      personal_team_owner_id = null;
    } else if (ownerUid) {
      workspace_scope = "personal_team";
      personal_team_owner_id = ownerUid;
    } else {
      return {
        ok: false,
        code: "MIGRATION_DEST_ACCESS_DENIED",
        status: 403,
        message: "Invalid drive ownership.",
      };
    }

    organization_id = null;
    visibility_scope = "personal";
  }

  let billingSnap;
  try {
    billingSnap = await getUploadBillingSnapshot(uid, driveId);
  } catch {
    return {
      ok: false,
      code: "MIGRATION_DEST_ACCESS_DENIED",
      status: 403,
      message: "You cannot import into this drive.",
    };
  }

  const contract: MigrationDestinationContract = {
    version: 1,
    path_subject_uid: uid,
    linked_drive_id: driveId,
    destination_path_prefix: destination_path_prefix,
    workspace_id: workspaceId,
    workspace_scope,
    organization_id,
    personal_team_owner_id,
    visibility_scope,
    drive_name_snapshot: driveName,
    billing_key: billingSnap.billing_key,
    quota_subject_uid: billingSnap.quota_subject_uid,
    destination_validated_at: new Date().toISOString(),
  };

  return { ok: true, contract };
}

/**
 * Lightweight re-validation for workers: drive row still exists and matches contract scope.
 */
export async function migrationDestinationStillValid(
  db: Firestore,
  contract: MigrationDestinationContract
): Promise<{ ok: true } | { ok: false; code: MigrationDestinationErrorCode; message: string }> {
  const driveSnap = await db.collection("linked_drives").doc(contract.linked_drive_id).get();
  if (!driveSnap.exists || driveSnap.data()?.deleted_at != null) {
    return {
      ok: false,
      code: "MIGRATION_DEST_DRIVE_NOT_FOUND",
      message: "Destination drive no longer exists.",
    };
  }
  const d = driveSnap.data()!;
  const name = (d.name as string | undefined)?.trim() ?? "";
  if (d.is_creator_raw === true) {
    return {
      ok: false,
      code: "MIGRATION_DEST_RAW_FORBIDDEN",
      message: "Destination became invalid (RAW).",
    };
  }
  if (name === "Gallery Media" || name.toLowerCase() === "gallery media") {
    return {
      ok: false,
      code: "MIGRATION_DEST_GALLERY_FORBIDDEN",
      message: "Destination became invalid (Gallery Media).",
    };
  }
  if (!isAllowedStorageName(name)) {
    return {
      ok: false,
      code: "MIGRATION_DEST_NOT_STORAGE",
      message: "Destination is no longer Storage.",
    };
  }
  const driveOrg =
    typeof d.organization_id === "string" && d.organization_id.trim() ? d.organization_id.trim() : null;
  if ((contract.organization_id ?? null) !== (driveOrg ?? null)) {
    return {
      ok: false,
      code: "MIGRATION_DEST_WORKSPACE_DRIVE_MISMATCH",
      message: "Organization scope no longer matches destination drive.",
    };
  }
  return { ok: true };
}
