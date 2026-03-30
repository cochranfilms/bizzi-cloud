import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import {
  getEnterpriseWorkspaceStorageSummary,
  deprecatedStorageFieldsFromSummary,
} from "@/lib/storage-display";
import { sumQuotaCountedUserOrgBackupBytes } from "@/lib/backup-file-storage-bytes";
import {
  billingKeyForOrg,
  sumPendingReservationBytesForRequestingUser,
} from "@/lib/storage-quota-reservations";
import { seatNumericCapForEnforcement } from "@/lib/org-seat-quota";
import { NextResponse } from "next/server";

/** GET - Enterprise org storage display (lifecycle-aware file counts + reservations). */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;

  if (!orgId) {
    return NextResponse.json(
      { error: "You are not in an organization" },
      { status: 403 }
    );
  }

  const access = await resolveEnterpriseAccess(uid, orgId);
  if (!access.canAccessEnterprise) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403 }
    );
  }

  const summary = await getEnterpriseWorkspaceStorageSummary(orgId, uid);
  const deprecated = deprecatedStorageFieldsFromSummary(summary);

  const seatSnap = await db.collection("organization_seats").doc(`${orgId}_${uid}`).get();
  const seatRow = seatSnap.data();
  const seatCap = seatNumericCapForEnforcement(seatRow as Record<string, unknown> | undefined);
  const seatUsed = await sumQuotaCountedUserOrgBackupBytes(db, uid, orgId);
  const seatReserved = await sumPendingReservationBytesForRequestingUser(
    billingKeyForOrg(orgId),
    uid
  );
  const seatEffective = seatUsed + seatReserved;
  const orgEffective = summary.effective_billable_bytes_for_enforcement;
  const orgQuota = summary.quota_bytes;
  const org_pool_state =
    orgQuota === null ? "within_pool" : orgEffective > orgQuota ? "over_pool" : "within_pool";
  const seat_state =
    typeof seatCap !== "number"
      ? "within_quota"
      : seatEffective > seatCap
        ? "over_quota"
        : "within_quota";

  return NextResponse.json({
    ...summary,
    org_pool_state,
    seat: {
      quota_mode: (seatRow?.quota_mode as string | undefined) ?? (seatCap === null ? "org_unlimited" : "fixed"),
      storage_quota_bytes: seatRow?.storage_quota_bytes ?? null,
      used_bytes: seatUsed,
      reserved_bytes: seatReserved,
      effective_bytes: seatEffective,
      remaining_bytes: typeof seatCap === "number" ? Math.max(0, seatCap - seatEffective) : null,
      unlimited_within_org_pool: seatCap === null,
      state: seat_state,
    },
    _deprecated: {
      storage_used_bytes: deprecated.storage_used_bytes,
      storage_used_total_for_quota: deprecated.storage_used_total_for_quota,
      storage_quota_bytes: summary.quota_bytes,
    },
  });
}
