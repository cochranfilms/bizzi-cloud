import { verifyIdToken, getAdminFirestore } from "@/lib/firebase-admin";
import {
  getPersonalDashboardStorageDisplay,
  getEnterpriseWorkspaceStorageSummary,
  deprecatedStorageFieldsFromSummary,
} from "@/lib/storage-display";
import { NextResponse } from "next/server";

/**
 * GET - Normalized storage display for personal or enterprise workspace context.
 * Used for badges, pre-upload checks, and quota modal.
 */
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

  try {
    const { searchParams } = new URL(request.url);
    const context = searchParams.get("context") as "personal" | "enterprise" | null;
    const db = getAdminFirestore();
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const profileOrgId = profileSnap.data()?.organization_id as string | undefined;
    const useEnterprise = context === "enterprise" && profileOrgId;

    const summary = useEnterprise
      ? await getEnterpriseWorkspaceStorageSummary(profileOrgId!, uid)
      : await getPersonalDashboardStorageDisplay(uid);

    const deprecated = deprecatedStorageFieldsFromSummary(summary);

    return NextResponse.json({
      ...summary,
      is_organization_user: !!profileOrgId,
      _deprecated: {
        storage_used_bytes: deprecated.storage_used_bytes,
        storage_used_total_for_quota: deprecated.storage_used_total_for_quota,
        storage_quota_bytes: summary.quota_bytes,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get storage status";
    console.error("[storage/status] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
