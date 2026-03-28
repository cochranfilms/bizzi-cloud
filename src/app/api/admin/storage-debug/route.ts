/**
 * GET /api/admin/storage-debug?user_id=...
 * Support-facing snapshot: billable file-backed usage, reservations, quota (admin auth).
 */
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getPersonalDashboardStorageDisplay } from "@/lib/storage-display";
import { getUploadBillingSnapshot } from "@/lib/enterprise-storage";
import { sumPendingReservationBytes } from "@/lib/storage-quota-reservations";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const uid = new URL(request.url).searchParams.get("user_id")?.trim();
  if (!uid) {
    return NextResponse.json({ error: "user_id query required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;

  const personal = await getPersonalDashboardStorageDisplay(uid);
  const billing = await getUploadBillingSnapshot(uid).catch(() => null);

  return NextResponse.json({
    user_id: uid,
    organization_id: orgId ?? null,
    display: personal,
    upload_billing_snapshot: billing
      ? {
          billing_key: billing.billing_key,
          file_used_bytes: billing.file_used_bytes,
          quota_bytes: billing.quota_bytes,
          quota_subject_uid: billing.quota_subject_uid,
        }
      : null,
    reserved_bytes_personal_billing_key: billing
      ? await sumPendingReservationBytes(billing.billing_key)
      : null,
  });
}
