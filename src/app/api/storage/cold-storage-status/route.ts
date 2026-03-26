/**
 * GET /api/storage/cold-storage-status
 * Returns whether the current user has files in cold storage and how to restore.
 * Org / team recovery CTAs are only for container admins (recovery owners).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const ORG_MEMBER_INFO =
  "This organization is in recovery storage. Only the organization admin can restore access.";
const TEAM_MEMBER_INFO =
  "This team workspace is in recovery storage. Only the team admin (account owner) can restore access.";

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
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const profileEmail = (profileData?.email as string)?.trim()?.toLowerCase() ?? "";

  const teamLifecycle =
    (profileData?.team_storage_lifecycle_status as string | undefined) ?? "active";
  const teamColdSnap = await db
    .collection("cold_storage_files")
    .where("personal_team_owner_id", "==", uid)
    .limit(1)
    .get();

  if (!teamColdSnap.empty || teamLifecycle === "cold_storage") {
    const first = teamColdSnap.docs[0]?.data();
    const expiresFromFile = first?.cold_storage_expires_at?.toDate?.();
    const expiresFromProfile = profileData?.team_cold_storage_expires_at?.toDate?.();
    const expiresAt = expiresFromFile ?? expiresFromProfile ?? null;
    const daysRemaining = expiresAt
      ? Math.max(
          0,
          Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        )
      : null;
    const restoreUrl =
      (profileData?.team_restore_invoice_url as string | undefined) ?? "/dashboard/change-plan";

    return NextResponse.json({
      hasColdStorage: true,
      containerType: "personal_team",
      recoveryRole: "team_admin",
      canRestoreContainer: true,
      sourceType: (first?.source_type as string) ?? "subscription_end",
      expiresAt: expiresAt?.toISOString() ?? null,
      daysRemaining,
      restoreUrl,
      unpaidInvoiceUrl: null,
      billingStatus: (profileData?.billing_status as string | undefined) ?? null,
      informationalMessage: null,
      orgName: null,
    });
  }

  if (profileEmail) {
    const teamUploaderSnap = await db
      .collection("cold_storage_files")
      .where("uploader_email", "==", profileEmail)
      .where("storage_scope_type", "==", "personal_team")
      .limit(3)
      .get();
    const pto = profileData?.personal_team_owner_id as string | undefined;
    const formerTeamDoc = teamUploaderSnap.docs.find((d) => {
      const owner = d.data().personal_team_owner_id as string | undefined;
      return owner && owner !== pto;
    });
    if (formerTeamDoc) {
      const expiresAt =
        formerTeamDoc.data().cold_storage_expires_at?.toDate?.() ??
        formerTeamDoc.data().retention_end_at?.toDate?.();
      const daysRemaining = expiresAt
        ? Math.max(
            0,
            Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          )
        : null;
      return NextResponse.json({
        hasColdStorage: true,
        containerType: "personal_team",
        recoveryRole: "team_member",
        canRestoreContainer: false,
        sourceType: (formerTeamDoc.data().source_type as string) ?? "subscription_end",
        expiresAt: expiresAt?.toISOString() ?? null,
        daysRemaining,
        restoreUrl: null,
        unpaidInvoiceUrl: null,
        billingStatus: null,
        informationalMessage: TEAM_MEMBER_INFO,
        orgName: null,
      });
    }
  }

  const consumerSnap = await db
    .collection("cold_storage_files")
    .where("user_id", "==", uid)
    .where("org_id", "==", null)
    .limit(10)
    .get();

  const consumerDoc = consumerSnap.docs.find((d) => !d.data().personal_team_owner_id);
  if (consumerDoc) {
    const data = consumerDoc.data();
    const expiresAt =
      data.cold_storage_expires_at?.toDate?.() ?? data.retention_end_at?.toDate?.();
    const sourceType = (data.source_type as string) ?? "subscription_end";

    const unpaidInvoiceUrl = profileData?.unpaid_invoice_url as string | undefined;
    const billingStatus = profileData?.billing_status as string | undefined;

    const daysRemaining = expiresAt
      ? Math.max(
          0,
          Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        )
      : null;

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
      const allFilesSnap = await db
        .collection("cold_storage_files")
        .where("user_id", "==", uid)
        .where("org_id", "==", null)
        .get();
      for (const d of allFilesSnap.docs) {
        if (d.data().personal_team_owner_id) continue;
        totalBytesUsed += (d.data().size_bytes as number) ?? 0;
      }
    }

    return NextResponse.json({
      hasColdStorage: true,
      containerType: "consumer",
      recoveryRole: "consumer",
      canRestoreContainer: true,
      sourceType,
      expiresAt: expiresAt?.toISOString() ?? null,
      daysRemaining,
      restoreUrl:
        unpaidInvoiceUrl && billingStatus === "past_due"
          ? unpaidInvoiceUrl
          : "/dashboard/change-plan",
      unpaidInvoiceUrl: unpaidInvoiceUrl ?? null,
      billingStatus: billingStatus ?? null,
      informationalMessage: null,
      orgName: null,
      restoreRequirements:
        sourceType === "account_delete" && totalBytesUsed > 0
          ? { totalBytesUsed, requiredAddonIds }
          : undefined,
    });
  }

  if (!profileEmail) {
    return NextResponse.json({
      hasColdStorage: false,
    });
  }

  const memberColdSnap = await db
    .collection("cold_storage_files")
    .where("member_email", "==", profileEmail)
    .limit(1)
    .get();

  if (!memberColdSnap.empty) {
    const d0 = memberColdSnap.docs[0];
    const orgId = d0.data().org_id as string | undefined;
    const orgSnap = orgId ? await db.collection("organizations").doc(orgId).get() : null;
    const orgData = orgSnap?.data();
    const expiresAt =
      d0.data().cold_storage_expires_at?.toDate?.() ??
      d0.data().retention_end_at?.toDate?.();
    const daysRemaining = expiresAt
      ? Math.max(
          0,
          Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        )
      : null;
    return NextResponse.json({
      hasColdStorage: true,
      containerType: "organization",
      recoveryRole: "org_member",
      canRestoreContainer: false,
      sourceType: (d0.data().source_type as string) ?? "org_removal",
      expiresAt: expiresAt?.toISOString() ?? null,
      daysRemaining,
      restoreUrl: null,
      unpaidInvoiceUrl: null,
      billingStatus: null,
      informationalMessage: ORG_MEMBER_INFO,
      orgName: orgData?.name ?? null,
    });
  }

  const ownerColdSnap = await db
    .collection("cold_storage_files")
    .where("owner_email", "==", profileEmail)
    .limit(1)
    .get();

  if (ownerColdSnap.empty) {
    return NextResponse.json({
      hasColdStorage: false,
    });
  }

  const orgId = ownerColdSnap.docs[0].data().org_id as string | undefined;
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

  const firstFile = ownerColdSnap.docs[0].data();
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
    containerType: "organization",
    recoveryRole: "org_admin",
    canRestoreContainer: true,
    sourceType: (firstFile.source_type as string) ?? "org_removal",
    expiresAt: expiresAt?.toISOString() ?? null,
    daysRemaining,
    restoreUrl:
      unpaidInvoiceUrl && billingStatus === "past_due"
        ? unpaidInvoiceUrl
        : restoreInvoiceUrl ?? null,
    unpaidInvoiceUrl: unpaidInvoiceUrl ?? null,
    billingStatus: billingStatus ?? null,
    informationalMessage: null,
    orgName: orgData?.name ?? null,
  });
}
