import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
/** GET - Current user's storage quota and used (for enterprise users). Org storage is shared. */
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

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgData = orgSnap.data();
  const storageQuotaBytes =
    typeof orgData?.storage_quota_bytes === "number"
      ? orgData.storage_quota_bytes
      : null;

  const filesSnap = await db
    .collection("backup_files")
    .where("organization_id", "==", orgId)
    .get();

  let storageUsedBytes = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data();
    if (data.deleted_at) continue;
    storageUsedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }

  return NextResponse.json({
    storage_quota_bytes: storageQuotaBytes,
    storage_used_bytes: storageUsedBytes,
  });
}
