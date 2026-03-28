/**
 * GET /api/storage/analytics
 * Returns aggregated storage analytics for the authenticated user.
 * REAL DATA: Aggregating from backup_files; folder_shares join for Shared category.
 * TODO: For accounts with 100k+ files, consider pre-aggregation.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { NextResponse } from "next/server";
import { aggregateFiles } from "@/lib/analytics/aggregate";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  let uid: string;
  if (isDevAuthBypass()) {
    const url = new URL(request.url);
    uid = url.searchParams.get("user_id") ?? "";
    if (!uid) {
      return NextResponse.json(
        { error: "user_id required in dev bypass mode" },
        { status: 400 }
      );
    }
  } else if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  const url = new URL(request.url);
  const context = (url.searchParams.get("context") as "personal" | "enterprise" | null) ?? "personal";

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const profileOrgId = profileData?.organization_id as string | undefined;

  const useEnterprise = context === "enterprise" && profileOrgId;
  const orgId = useEnterprise ? profileOrgId : null;

  if (orgId && !isDevAuthBypass()) {
    const access = await resolveEnterpriseAccess(uid, orgId);
    if (!access.canAccessEnterprise) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }
  }

  let quotaBytes: number | null;
  if (orgId) {
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    quotaBytes =
      typeof orgData?.storage_quota_bytes === "number"
        ? orgData.storage_quota_bytes
        : null;
  } else {
    const profileQuota = profileData?.storage_quota_bytes;
    quotaBytes =
      typeof profileQuota === "number"
        ? profileQuota
        : 50 * 1024 * 1024 * 1024;
  }

  let filesQuery;
  if (orgId) {
    filesQuery = db.collection("backup_files").where("organization_id", "==", orgId);
  } else {
    filesQuery = db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("organization_id", "==", null);
  }

  const filesSnap = await filesQuery.get();

  const sharedFileIds = new Set<string>();
  const sharesSnap = await db
    .collection("folder_shares")
    .where("owner_id", "==", uid)
    .get();

  for (const shareDoc of sharesSnap.docs) {
    const data = shareDoc.data();
    const ids = data.referenced_file_ids as string[] | undefined;
    if (Array.isArray(ids)) {
      ids.forEach((id: string) => sharedFileIds.add(id));
    }
    const backupFileId = data.backup_file_id as string | null | undefined;
    if (backupFileId) {
      sharedFileIds.add(backupFileId);
    }
  }

  let totalUsedBytes = 0;
  const files: Array<{
    id: string;
    relative_path?: string;
    size_bytes: number;
    content_type?: string | null;
    usage_status?: string | null;
    deleted_at?: unknown;
    modified_at?: string | null;
    created_at?: string | null;
    raw_format?: string | null;
  }> = [];

  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data();
    const size = typeof data.size_bytes === "number" ? data.size_bytes : 0;
    if (!data.deleted_at) {
      totalUsedBytes += size;
    }
    files.push({
      id: docSnap.id,
      relative_path: data.relative_path,
      size_bytes: size,
      content_type: data.content_type,
      usage_status: data.usage_status,
      deleted_at: data.deleted_at,
      modified_at: data.modified_at,
      created_at: data.created_at,
      raw_format: data.raw_format,
    });
  }

  const agg = aggregateFiles(files, sharedFileIds, totalUsedBytes, quotaBytes);

  const lastRecalc = profileData?.storage_recalculated_at;
  const lastUpdated =
    (lastRecalc && typeof lastRecalc === "object" && "toDate" in lastRecalc
      ? (lastRecalc as { toDate: () => Date }).toDate().toISOString()
      : null) ??
    (typeof lastRecalc === "string" ? lastRecalc : null) ??
    new Date().toISOString();

  return NextResponse.json({
    ...agg,
    lastUpdated,
    largestFileType: agg.largestFiles[0]
      ? agg.categories.find((c) => c.id === agg.largestFiles[0]!.category)?.label ?? "Other"
      : null,
  });
}
