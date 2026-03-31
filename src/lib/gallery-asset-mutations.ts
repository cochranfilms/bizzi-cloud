/**
 * Centralized side-effects for gallery asset changes: assets_version bump + audit logging.
 * Logging is fire-and-forget so mutations never wait on activity_logs writes.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { DocumentData } from "firebase-admin/firestore";
import {
  logActivityEvent,
  type ActivityEventType,
  type ActivityScopeType,
} from "@/lib/activity-log";

function activityScopeFromGalleryRow(gallery: DocumentData): ActivityScopeType {
  const oid = gallery.organization_id;
  if (oid != null && String(oid).trim() !== "") return "organization";
  return "personal_account";
}

/** Increment monotonic manage-list version; creates field if missing. Returns new version (best-effort read-after-write). */
export async function bumpGalleryAssetsVersion(
  db: Firestore,
  galleryId: string
): Promise<number> {
  const ref = db.collection("galleries").doc(galleryId);
  await ref.update({
    assets_version: FieldValue.increment(1),
    updated_at: new Date(),
  });
  const snap = await ref.get();
  const v = snap.data()?.assets_version;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function readAssetsVersion(gallery: DocumentData): number {
  const v = gallery.assets_version;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Weak ETag for conditional GET on manage asset list (version-only invalidation). */
export function weakEtagForGalleryAssets(galleryId: string, version: number): string {
  return `W/"g=${galleryId};v=${version}"`;
}

export function ifNoneMatchIndicatesUnchanged(
  ifNoneMatchHeader: string | null,
  etag: string
): boolean {
  if (!ifNoneMatchHeader?.trim()) return false;
  const candidates = ifNoneMatchHeader.split(",").map((s) => s.trim());
  return candidates.some((c) => c === etag);
}

export function fireAndForgetGalleryAssetActivity(input: {
  event_type: ActivityEventType;
  actor_user_id: string;
  gallery: DocumentData;
  gallery_id: string;
  metadata?: Record<string, unknown> | null;
  correlation_id?: string | null;
  file_id?: string | null;
  target_name?: string | null;
}): void {
  const {
    event_type,
    actor_user_id,
    gallery,
    gallery_id,
    metadata,
    correlation_id,
    file_id,
    target_name,
  } = input;
  const scope_type = activityScopeFromGalleryRow(gallery);
  const orgId = gallery.organization_id as string | null | undefined;
  void logActivityEvent({
    event_type,
    actor_user_id,
    scope_type,
    organization_id: orgId ?? null,
    workspace_id: null,
    file_id: file_id ?? null,
    target_type: "file",
    target_name: target_name ?? null,
    metadata: {
      gallery_id,
      correlation_id: correlation_id ?? null,
      ...metadata,
    },
  }).catch(() => {});
}

export function getRequestCorrelationId(request: Request): string {
  const h = request.headers.get("x-request-id") ?? request.headers.get("X-Request-Id");
  if (h && h.trim()) return h.trim();
  return crypto.randomUUID();
}
