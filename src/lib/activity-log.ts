/**
 * Unified activity logging for personal and organization accounts.
 * One shared activity_logs collection, same helper, scope distinguishes personal vs org.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type ActivityScopeType = "personal_account" | "organization";
export type ActivityEventType =
  | "file_uploaded"
  | "creator_raw_media_rejected"
  | "upload_destination_mismatch"
  | "folder_created"
  | "file_renamed"
  | "folder_renamed"
  | "file_moved"
  | "folder_moved"
  | "file_deleted"
  | "folder_deleted"
  | "file_restored"
  | "folder_restored"
  | "share_link_created"
  | "share_link_removed"
  | "bulk_upload_completed";

export interface LogActivityInput {
  event_type: ActivityEventType;
  actor_user_id: string;
  scope_type: ActivityScopeType;
  organization_id?: string | null;
  workspace_id?: string | null;
  workspace_type?: string | null;
  linked_drive_id?: string | null;
  drive_type?: "storage" | "raw" | "gallery" | null;
  file_id?: string | null;
  folder_id?: string | null;
  target_type?: "file" | "folder" | null;
  target_name?: string | null;
  file_path?: string | null;
  old_path?: string | null;
  new_path?: string | null;
  visibility_scope?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Validate required fields, normalize nulls, set created_at with server timestamp,
 * and write to activity_logs collection. Fire-and-forget; errors are logged.
 */
export async function logActivityEvent(input: LogActivityInput): Promise<void> {
  const { event_type, actor_user_id, scope_type } = input;

  if (!event_type || typeof event_type !== "string") {
    console.warn("[activity-log] Missing or invalid event_type");
    return;
  }
  if (!actor_user_id || typeof actor_user_id !== "string") {
    console.warn("[activity-log] Missing or invalid actor_user_id");
    return;
  }
  if (!scope_type || (scope_type !== "personal_account" && scope_type !== "organization")) {
    console.warn("[activity-log] Missing or invalid scope_type");
    return;
  }

  const doc: Record<string, unknown> = {
    event_type,
    actor_user_id,
    scope_type,
    organization_id: input.organization_id ?? null,
    workspace_id: input.workspace_id ?? null,
    workspace_type: input.workspace_type ?? null,
    linked_drive_id: input.linked_drive_id ?? null,
    drive_type: input.drive_type ?? null,
    file_id: input.file_id ?? null,
    folder_id: input.folder_id ?? null,
    target_type: input.target_type ?? null,
    target_name: input.target_name ?? null,
    file_path: input.file_path ?? null,
    old_path: input.old_path ?? null,
    new_path: input.new_path ?? null,
    visibility_scope: input.visibility_scope ?? null,
    metadata: input.metadata ?? null,
    created_at: FieldValue.serverTimestamp(),
  };

  try {
    const db = getAdminFirestore();
    await db.collection("activity_logs").add(doc);
  } catch (err) {
    console.error("[activity-log] Write failed:", err);
  }
}
