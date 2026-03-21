/**
 * GET /api/storage/cold-storage-status
 * Returns whether the current user has files in cold storage and how to restore.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();

  // Check for consumer cold storage (user_id = uid, org_id = null)
  const consumerSnap = await db
    .collection("cold_storage_files")
    .where("user_id", "==", uid)
    .where("org_id", "==", null)
    .limit(1)
    .get();

  if (!consumerSnap.empty) {
    const doc = consumerSnap.docs[0];
    const data = doc.data();
    const expiresAt =
      data.cold_storage_expires_at?.toDate?.() ??
      data.retention_end_at?.toDate?.();
    const sourceType = (data.source_type as string) ?? "subscription_end";

    const profileSnapForConsumer = await db.collection("profiles").doc(uid).get();
    const profileDataForConsumer = profileSnapForConsumer.data();
    const unpaidInvoiceUrl = profileDataForConsumer?.unpaid_invoice_url as
      | string
      | undefined;
    const billingStatus = profileDataForConsumer?.billing_status as
      | string
      | undefined;

    const daysRemaining = expiresAt
      ? Math.max(
          0,
          Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        )
      : null;

    // Restore requirements: min storage and required addons (for account_delete restores)
    let totalBytesUsed = 0;
    let requiredAddonIds: string[] = [];
    const requirementsSnap = await db
      .collection("cold_storage_restore_requirements")
      .doc(uid)
      .get();
    if (requirementsSnap.exists) {
      const req = requirementsSnap.data();
      totalBytesUsed = (req?.total_bytes_used as number) ?? 0;
      requiredAddonIds = (req?.required_addon_ids as string[]) ?? [];
    } else {
      // Fallback for pre-migration: sum from cold_storage_files
      const allFilesSnap = await db
        .collection("cold_storage_files")
        .where("user_id", "==", uid)
        .where("org_id", "==", null)
        .get();
      for (const d of allFilesSnap.docs) {
        totalBytesUsed += (d.data().size_bytes as number) ?? 0;
      }
    }

    return NextResponse.json({
      hasColdStorage: true,
      sourceType,
      expiresAt: expiresAt?.toISOString() ?? null,
      daysRemaining,
      restoreUrl:
        unpaidInvoiceUrl && billingStatus === "past_due"
          ? unpaidInvoiceUrl
          : "/dashboard/change-plan",
      unpaidInvoiceUrl: unpaidInvoiceUrl ?? null,
      billingStatus: billingStatus ?? null,
      restoreRequirements:
        sourceType === "account_delete" && totalBytesUsed > 0
          ? { totalBytesUsed, requiredAddonIds }
          : undefined,
    });
  }

  // Check for org cold storage (user is org owner with cold storage)
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const profileEmail = (profileData?.email as string)?.trim()?.toLowerCase();

  if (!profileEmail) {
    return NextResponse.json({
      hasColdStorage: false,
    });
  }

  // Find orgs in cold storage where this user could be owner (match by cold_storage_files owner_email)
  const coldStorageSnap = await db
    .collection("cold_storage_files")
    .where("owner_email", "==", profileEmail)
    .limit(1)
    .get();

  if (coldStorageSnap.empty) {
    return NextResponse.json({
      hasColdStorage: false,
    });
  }

  const orgId = coldStorageSnap.docs[0].data().org_id as string | undefined;
  if (!orgId) {
    return NextResponse.json({
      hasColdStorage: false,
    });
  }

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgData = orgSnap.data();
  const restoreInvoiceUrl = orgData?.restore_invoice_url as string | undefined;
  const unpaidInvoiceUrl = orgData?.unpaid_invoice_url as string | undefined;
  const billingStatus = orgData?.billing_status as string | undefined;

  const firstFile = coldStorageSnap.docs[0].data();
  const expiresAt =
    firstFile.cold_storage_expires_at?.toDate?.() ??
    firstFile.retention_end_at?.toDate?.();

  const daysRemaining = expiresAt
    ? Math.max(
        0,
        Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      )
    : null;

  return NextResponse.json({
    hasColdStorage: true,
    sourceType: "org_removal",
    expiresAt: expiresAt?.toISOString() ?? null,
    daysRemaining,
    restoreUrl:
      unpaidInvoiceUrl && billingStatus === "past_due"
        ? unpaidInvoiceUrl
        : restoreInvoiceUrl ?? null,
    unpaidInvoiceUrl: unpaidInvoiceUrl ?? null,
    billingStatus: billingStatus ?? null,
    orgName: orgData?.name ?? null,
  });
}
