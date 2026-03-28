/**
 * Derived org fields for admin UI / monitoring — not the enforcement source of truth.
 */

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { OrganizationSeatQuotaMode } from "@/lib/enterprise-constants";

function modeFromSeatData(data: Record<string, unknown>): OrganizationSeatQuotaMode {
  const m = data.quota_mode as string | undefined;
  if (m === "org_unlimited" || m === "fixed") return m;
  const bytes = data.storage_quota_bytes;
  if (typeof bytes === "number") return "fixed";
  return "org_unlimited";
}

export async function syncOrganizationSeatAllocationSummary(
  db: Firestore,
  orgId: string
): Promise<void> {
  const snap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("status", "==", "active")
    .get();

  let numericAllocated = 0;
  let fixedCount = 0;
  let unlimitedCount = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const mode = modeFromSeatData(data as Record<string, unknown>);
    const bytes = data.storage_quota_bytes;
    if (mode === "fixed" && typeof bytes === "number") {
      numericAllocated += bytes;
      fixedCount += 1;
    } else {
      unlimitedCount += 1;
    }
  }

  await db.collection("organizations").doc(orgId).set(
    {
      numeric_allocated_seat_bytes: numericAllocated,
      active_seat_count: snap.size,
      fixed_quota_seat_count: fixedCount,
      unlimited_seat_count: unlimitedCount,
      seat_allocation_summary_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
