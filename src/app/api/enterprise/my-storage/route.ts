import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  getEnterpriseWorkspaceStorageSummary,
  deprecatedStorageFieldsFromSummary,
} from "@/lib/storage-display";
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

  const summary = await getEnterpriseWorkspaceStorageSummary(orgId, uid);
  const deprecated = deprecatedStorageFieldsFromSummary(summary);

  return NextResponse.json({
    ...summary,
    _deprecated: {
      storage_used_bytes: deprecated.storage_used_bytes,
      storage_used_total_for_quota: deprecated.storage_used_total_for_quota,
      storage_quota_bytes: summary.quota_bytes,
    },
  });
}
