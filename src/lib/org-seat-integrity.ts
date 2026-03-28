import type { Firestore } from "firebase-admin/firestore";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";

export async function assertAtMostOneActiveSeatPerUser(
  db: Firestore,
  orgId: string,
  userId: string
): Promise<void> {
  const snap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("user_id", "==", userId)
    .where("status", "==", "active")
    .get();
  if (snap.size <= 1) return;
  logEnterpriseSecurityEvent("duplicate_active_seat", {
    orgId,
    userId,
    count: snap.size,
    doc_ids: snap.docs.map((d) => d.id),
  });
  throw new Error(
    "Organization membership data is inconsistent (duplicate active seat). Contact support."
  );
}
