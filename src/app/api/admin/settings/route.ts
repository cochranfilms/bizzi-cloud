/**
 * GET /api/admin/settings
 * Returns real platform settings from Firestore admin_settings + plan-constants.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { PLAN_STORAGE_BYTES } from "@/lib/plan-constants";

const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 ** 3;

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
