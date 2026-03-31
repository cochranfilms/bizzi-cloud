/**
 * Server-side upload finalization guards for locked Creator RAW sessions.
 * Intent fields are client-supplied — they prevent accidental wrong-folder writes, not a determined attacker.
 */

import type { DocumentSnapshot } from "firebase-admin/firestore";
import { logActivityEvent } from "@/lib/activity-log";
import {
  creatorRawFinalizeAllowsFileName,
  leafNameFromRelativePath,
} from "@/lib/creator-raw-upload-policy";

export const LOCKED_CREATOR_RAW_INTENTS = new Set(["creator_raw_video", "creator_raw_upload"]);

export function isLockedCreatorRawPayload(input: {
  uploadIntent?: string | null;
  lockedDestination?: boolean | string | null;
  destinationMode?: string | null;
}): boolean {
  const intent = input.uploadIntent ?? "";
  const locked =
    input.lockedDestination === true ||
    input.lockedDestination === "true" ||
    input.lockedDestination === "1";
  const mode = input.destinationMode ?? "";
  const lockedByMode = mode === "creator_raw";
  return (LOCKED_CREATOR_RAW_INTENTS.has(intent) && locked) || (lockedByMode && locked);
}

export async function logUploadDestinationMismatch(input: {
  actor_user_id: string;
  organization_id?: string | null;
  workspace_id?: string | null;
  declared_intent?: string | null;
  declared_locked?: boolean | string | null;
  destination_mode?: string | null;
  drive_id: string;
  drive_is_creator_raw: boolean;
  route_context?: string | null;
  source_surface?: string | null;
  object_key?: string | null;
  relative_path?: string | null;
}): Promise<void> {
  await logActivityEvent({
    event_type: "upload_destination_mismatch",
    actor_user_id: input.actor_user_id,
    scope_type: input.organization_id ? "organization" : "personal_account",
    organization_id: input.organization_id ?? null,
    workspace_id: input.workspace_id ?? null,
    linked_drive_id: input.drive_id,
    drive_type: input.drive_is_creator_raw ? "raw" : "storage",
    visibility_scope: null,
    metadata: {
      declared_intent: input.declared_intent,
      declared_locked: input.declared_locked,
      destination_mode: input.destination_mode,
      drive_is_creator_raw: input.drive_is_creator_raw,
      route_context: input.route_context,
      source_surface: input.source_surface,
      object_key: input.object_key,
      relative_path: input.relative_path,
    },
  }).catch(() => {});
}

/** Returns HTTP status + body message when finalize must abort. */
export async function assertCreatorRawFinalizeOrAudit(input: {
  uid: string;
  driveId: string;
  driveSnap: DocumentSnapshot;
  uploadIntent?: string | null;
  lockedDestination?: boolean | string | null;
  destinationMode?: string | null;
  routeContext?: string | null;
  sourceSurface?: string | null;
  objectKey?: string | null;
  relativePath?: string | null;
  organizationId?: string | null;
  workspaceId?: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const locked = isLockedCreatorRawPayload({
    uploadIntent: input.uploadIntent,
    lockedDestination: input.lockedDestination,
    destinationMode: input.destinationMode,
  });
  if (!locked) return { ok: true };

  const data = input.driveSnap.data();
  const isRaw = data?.is_creator_raw === true;

  if (input.driveSnap.exists && isRaw) {
    const leaf = input.relativePath ? leafNameFromRelativePath(input.relativePath) : "";
    if (leaf && !creatorRawFinalizeAllowsFileName(leaf)) {
      return {
        ok: false,
        status: 400,
        message:
          "This file type is not supported for Creator RAW. Upload it to Storage instead, or use a format Bizzi can preview and grade.",
      };
    }
    return { ok: true };
  }

  await logUploadDestinationMismatch({
    actor_user_id: input.uid,
    organization_id: input.organizationId,
    workspace_id: input.workspaceId,
    declared_intent: input.uploadIntent ?? null,
    declared_locked: input.lockedDestination ?? null,
    destination_mode: input.destinationMode ?? null,
    drive_id: input.driveId,
    drive_is_creator_raw: isRaw,
    route_context: input.routeContext ?? null,
    source_surface: input.sourceSurface ?? null,
    object_key: input.objectKey ?? null,
    relative_path: input.relativePath ?? null,
  });

  return {
    ok: false,
    status: 400,
    message:
      "Upload destination does not match Creator RAW. Refresh the page and try again, or contact support if this persists.",
  };
}
