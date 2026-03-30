import { getAdminFirestore, verifyIdToken, getAdminAuth } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { quotaCountedSizeBytesFromBackupFile } from "@/lib/backup-file-lifecycle";
import { syncOrganizationSeatAllocationSummary } from "@/lib/org-seat-allocation-summary";

/**
 * Writes cached display totals on the organization (`organizations.storage_used_bytes`).
 *
 * This is for UI reconciliation and reporting only. It is NOT the authoritative upload enforcement path:
 * quota checks must use live Firestore aggregation (see enterprise-storage), not this field alone.
 *
 * Requires active org admin. Optional body: { "organization_id": "..." }.
 */
export async function POST(request: Request) {
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

  let bodyOrg: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      organization_id?: string;
    };
    bodyOrg =
      typeof body.organization_id === "string" ? body.organization_id.trim() : undefined;
  } catch {
    bodyOrg = undefined;
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileOrgId = profileSnap.data()?.organization_id as string | undefined;
  const orgId = bodyOrg && bodyOrg.length > 0 ? bodyOrg : profileOrgId;

  if (!orgId) {
    return NextResponse.json(
      { error: "Organization not specified or not in profile" },
      { status: 403 }
    );
  }

  const access = await resolveEnterpriseAccess(uid, orgId);
  if (!access.isAdmin) {
    logEnterpriseSecurityEvent("enterprise_admin_denied", {
      uid,
      orgId,
      route: "storage/recalculate-org",
    });
    return NextResponse.json(
      { error: "Only organization admins can recalculate storage" },
      { status: 403 }
    );
  }

  const filesSnap = await db
    .collection("backup_files")
    .where("organization_id", "==", orgId)
    .get();

  let totalBytes = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    totalBytes += quotaCountedSizeBytesFromBackupFile(data);
  }

  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  const prevUsed =
    orgSnap.exists && typeof orgSnap.data()?.storage_used_bytes === "number"
      ? orgSnap.data()!.storage_used_bytes
      : null;
  const storageQuota =
    orgSnap.exists && typeof orgSnap.data()?.storage_quota_bytes === "number"
      ? orgSnap.data()!.storage_quota_bytes
      : 500 * 1024 * 1024 * 1024;

  await orgRef.set(
    {
      storage_used_bytes: totalBytes,
      storage_recalculated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  let actorEmail: string | null = null;
  try {
    actorEmail = (await getAdminAuth().getUser(uid)).email ?? null;
  } catch {
    actorEmail = null;
  }

  logEnterpriseSecurityEvent("recalculate_org_executed", {
    uid,
    actorEmail,
    orgId,
    route: "storage/recalculate-org",
    previous_storage_used_bytes: prevUsed,
    new_storage_used_bytes: totalBytes,
    storage_quota_bytes: storageQuota,
  });

  await syncOrganizationSeatAllocationSummary(db, orgId);

  return NextResponse.json({
    storage_used_bytes: totalBytes,
    storage_quota_bytes: storageQuota,
  });
}
