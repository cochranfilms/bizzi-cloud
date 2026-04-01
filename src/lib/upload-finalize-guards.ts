/**
 * Server-side upload finalization guards for locked Creator RAW sessions.
 * Intent fields are client-supplied — they prevent accidental wrong-folder writes, not a determined attacker.
 * Media allow/deny uses ffprobe + creator-raw-media-validator; RED `.r3d` may finalize by trusted extension when ffprobe is incomplete.
 *
 * Rejection path: we return `{ ok: false }` only after logging (and deleting the object on codec rejection).
 * API routes must not create `backup_files` or commit quota after `{ ok: false }` — current callers
 * guard before DB writes and release reservations before returning errors.
 */

import type { DocumentSnapshot } from "firebase-admin/firestore";
import { logActivityEvent } from "@/lib/activity-log";
import { logCreatorRawProductEvent } from "@/lib/creator-raw-product-analytics";
import { deleteObject } from "@/lib/b2";
import { CREATOR_RAW_MEDIA_POLICY, CREATOR_RAW_REJECTION_MESSAGES } from "@/lib/creator-raw-media-config";
import { inspectMediaObjectKey } from "@/lib/creator-raw-media-probe";
import { classifyCreatorRawMedia } from "@/lib/creator-raw-media-validator";
import { leafNameFromRelativePath } from "@/lib/creator-raw-upload-policy";

export const LOCKED_CREATOR_RAW_INTENTS = new Set(["creator_raw_video", "creator_raw_upload"]);

const NON_RAW_LEAVES = new Set<string>(CREATOR_RAW_MEDIA_POLICY.nonCreatorRawLeafExtensions);

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

async function logCreatorRawMediaRejected(input: {
  actor_user_id: string;
  organization_id?: string | null;
  workspace_id?: string | null;
  drive_id: string;
  route_context?: string | null;
  source_surface?: string | null;
  object_key?: string | null;
  original_filename: string;
  extension: string;
  detected_container: string | null;
  detected_codec: string | null;
  detected_mime: string | null;
  allowed: boolean;
  rejection_reason: string;
      validation_code: string;
}): Promise<void> {
  logCreatorRawProductEvent("creator_raw_media_rejected", {
    validation_code: input.validation_code,
    rejection_reason: input.rejection_reason,
    extension: input.extension,
    detected_codec: input.detected_codec,
    detected_container: input.detected_container,
    route_context: input.route_context ?? null,
    source_surface: input.source_surface ?? null,
  });
  await logActivityEvent({
    event_type: "creator_raw_media_rejected",
    actor_user_id: input.actor_user_id,
    scope_type: input.organization_id ? "organization" : "personal_account",
    organization_id: input.organization_id ?? null,
    workspace_id: input.workspace_id ?? null,
    linked_drive_id: input.drive_id,
    drive_type: "raw",
    visibility_scope: null,
    metadata: {
      route_context: input.route_context,
      source_surface: input.source_surface,
      object_key: input.object_key,
      original_filename: input.original_filename,
      extension: input.extension,
      detected_container: input.detected_container,
      detected_codec: input.detected_codec,
      detected_mime: input.detected_mime,
      allowed: input.allowed,
      rejection_reason: input.rejection_reason,
      validation_code: input.validation_code,
    },
  }).catch(() => {});
}

export type CreatorRawFinalizeGuardInput = {
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
  contentType?: string | null;
  /**
   * Multipart: call with true before `completeMultipartUpload` (object not readable yet).
   * Presigned single PUT: false so ffprobe runs after the object exists.
   */
  skipMediaProbe?: boolean;
};

/** Returns HTTP status + body message when finalize must abort. */
export async function assertCreatorRawFinalizeOrAudit(
  input: CreatorRawFinalizeGuardInput
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
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
    const ext = leaf.includes(".") ? leaf.slice(leaf.lastIndexOf(".") + 1).toLowerCase() : "";

    if (leaf && NON_RAW_LEAVES.has(ext)) {
      logCreatorRawProductEvent("creator_raw_media_rejected", {
        validation_code: "non_media_leaf",
        rejection_reason: "blocked_leaf_extension",
        extension: ext,
        detected_codec: null,
        detected_container: null,
        route_context: input.routeContext ?? null,
        source_surface: input.sourceSurface ?? null,
      });
      const key = input.objectKey?.trim();
      if (key) await deleteObject(key).catch(() => {});
      return {
        ok: false,
        status: 400,
        message: CREATOR_RAW_REJECTION_MESSAGES.nonMediaLeaf,
      };
    }

    const skipProbe = input.skipMediaProbe === true;
    const objectKey = input.objectKey ?? "";

    if (!skipProbe && objectKey) {
      const inspected = await inspectMediaObjectKey(objectKey);
      const verdict = classifyCreatorRawMedia(inspected, leaf || unknownLeafFallback(leaf, objectKey), input.contentType);

      if (!verdict.allowed) {
        await logCreatorRawMediaRejected({
          actor_user_id: input.uid,
          organization_id: input.organizationId,
          workspace_id: input.workspaceId,
          drive_id: input.driveId,
          route_context: input.routeContext ?? null,
          source_surface: input.sourceSurface ?? null,
          object_key: objectKey,
          original_filename: leaf,
          extension: ext,
          detected_container: verdict.detectedContainer,
          detected_codec: verdict.detectedVideoCodec,
          detected_mime: verdict.detectedMime,
          allowed: false,
          rejection_reason: verdict.reason,
          validation_code: verdict.code,
        });
        await deleteObject(objectKey).catch(() => {});
        return {
          ok: false,
          status: 400,
          message: verdict.userMessage || CREATOR_RAW_REJECTION_MESSAGES.notSupported,
        };
      }
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

function unknownLeafFallback(leaf: string, objectKey: string): string {
  if (leaf) return leaf;
  const seg = objectKey.split("/").pop() ?? "upload.bin";
  return seg;
}
