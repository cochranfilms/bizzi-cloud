import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Recalculates storage_used_bytes for an organization from backup_files
 * of all active members. Call after bulk deletes or to fix stale org storage.
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

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  if (!orgId) {
    return NextResponse.json(
      { error: "You are not in an organization" },
      { status: 403 }
    );
  }

  const filesSnap = await db
    .collection("backup_files")
    .where("organization_id", "==", orgId)
    .get();

  let totalBytes = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data();
    if (data.deleted_at) continue;
    totalBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }

  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
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

  return NextResponse.json({
    storage_used_bytes: totalBytes,
    storage_quota_bytes: storageQuota,
  });
}
