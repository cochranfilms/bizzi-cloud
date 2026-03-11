/**
 * GET /api/admin/settings
 * Returns real platform settings from Firestore admin_settings + plan-constants.
 *
 * PATCH /api/admin/settings
 * Updates platform settings in Firestore (partial merge).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { PLAN_STORAGE_BYTES } from "@/lib/plan-constants";

const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 ** 3;

/** Map frontend payload to Firestore field names */
function toFirestoreUpdate(payload: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  const q = payload.quotas as Record<string, unknown> | undefined;
  if (q?.maxUploadBytes != null) update.maxUploadBytes = Number(q.maxUploadBytes);

  const r = payload.retention as Record<string, unknown> | undefined;
  if (r?.trashRetentionDays != null) update.trashRetentionDays = Number(r.trashRetentionDays);
  if (r?.archiveAfterInactiveDays !== undefined) update.archiveAfterInactiveDays = r.archiveAfterInactiveDays == null ? null : Number(r.archiveAfterInactiveDays);
  if (r?.permanentDeleteAfterDays !== undefined) update.permanentDeleteAfterDays = r.permanentDeleteAfterDays == null ? null : Number(r.permanentDeleteAfterDays);

  const a = payload.alerts as Record<string, unknown> | undefined;
  if (a?.errorRateWarningPercent != null) update.errorRateWarningPercent = Number(a.errorRateWarningPercent);
  if (a?.errorRateCriticalPercent != null) update.errorRateCriticalPercent = Number(a.errorRateCriticalPercent);
  if (a?.uploadFailureWarningCount != null) update.uploadFailureWarningCount = Number(a.uploadFailureWarningCount);
  if (a?.queueBacklogWarning != null) update.queueBacklogWarning = Number(a.queueBacklogWarning);

  const f = payload.features as Record<string, unknown> | undefined;
  if (f) {
    if (typeof f.newGalleryUI === "boolean") update.newGalleryUI = f.newGalleryUI;
    if (typeof f.videoPreviews === "boolean") update.videoPreviews = f.videoPreviews;
    if (typeof f.bulkDownload === "boolean") update.bulkDownload = f.bulkDownload;
    if (typeof f.transferPasswordOptional === "boolean") update.transferPasswordOptional = f.transferPasswordOptional;
    if (typeof f.maintenanceMode === "boolean") update.maintenanceMode = f.maintenanceMode;
  }

  const m = payload.maintenance as Record<string, unknown> | undefined;
  if (m) {
    if (typeof m.enabled === "boolean") update.maintenanceEnabled = m.enabled;
    if (typeof m.message === "string") update.maintenanceMessage = m.message;
  }

  const b = payload.banner as Record<string, unknown> | undefined;
  if (b) {
    if (typeof b.enabled === "boolean") update.bannerEnabled = b.enabled;
    if (typeof b.message === "string") update.bannerMessage = b.message;
    if (b.severity === "info" || b.severity === "warning" || b.severity === "critical") update.bannerSeverity = b.severity;
  }

  return update;
}

export async function PATCH(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update = toFirestoreUpdate(payload);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection("admin_settings").doc("platform");
  await ref.set({ ...update, updatedAt: new Date() }, { merge: true });

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();
  const settingsSnap = await db.collection("admin_settings").doc("platform").get();
  const stored = settingsSnap.exists ? settingsSnap.data() : null;

  return NextResponse.json({
    quotas: {
      freeStorageBytes: PLAN_STORAGE_BYTES.free,
      starterStorageBytes: PLAN_STORAGE_BYTES.solo,
      proStorageBytes: PLAN_STORAGE_BYTES.indie,
      businessStorageBytes: PLAN_STORAGE_BYTES.video,
      enterpriseStorageBytes: PLAN_STORAGE_BYTES.production,
      maxUploadBytes: (stored?.maxUploadBytes as number) ?? DEFAULT_MAX_UPLOAD_BYTES,
    },
    retention: {
      trashRetentionDays: (stored?.trashRetentionDays as number) ?? 30,
      archiveAfterInactiveDays: (stored?.archiveAfterInactiveDays as number) ?? 365,
      permanentDeleteAfterDays: (stored?.permanentDeleteAfterDays as number) ?? null,
    },
    alerts: {
      errorRateWarningPercent: (stored?.errorRateWarningPercent as number) ?? 5,
      errorRateCriticalPercent: (stored?.errorRateCriticalPercent as number) ?? 10,
      uploadFailureWarningCount: (stored?.uploadFailureWarningCount as number) ?? 100,
      queueBacklogWarning: (stored?.queueBacklogWarning as number) ?? 500,
    },
    features: {
      newGalleryUI: (stored?.newGalleryUI as boolean) ?? true,
      videoPreviews: (stored?.videoPreviews as boolean) ?? true,
      bulkDownload: (stored?.bulkDownload as boolean) ?? true,
      transferPasswordOptional: (stored?.transferPasswordOptional as boolean) ?? false,
      maintenanceMode: (stored?.maintenanceMode as boolean) ?? false,
    },
    maintenance: {
      enabled: (stored?.maintenanceEnabled as boolean) ?? false,
      message: (stored?.maintenanceMessage as string) ?? "",
    },
    banner: {
      enabled: (stored?.bannerEnabled as boolean) ?? false,
      message: (stored?.bannerMessage as string) ?? "",
      severity: ((stored?.bannerSeverity as string) ?? "info") as "info" | "warning" | "critical",
    },
  });
}
