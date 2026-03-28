import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { isPersonalScopeFileDoc } from "@/lib/backup-scope";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

/**
 * Recalculates profiles.storage_used_bytes from backup_files using the same
 * active-for-quota rules as billing (unified lifecycle). Does not touch
 * storage_quota_reservations; pending uploads still affect enforcement via the
 * storage status APIs until reservations commit or expire.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  let uid: string;
  if (isDevAuthBypass()) {
    const body = await request.json().catch(() => ({}));
    uid = body.user_id ?? "";
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

  const db = getAdminFirestore();

  // Profile storage bar = solo personal scope (not org, not personal-team container attribution).
  const filesSnap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .get();

  let totalBytes = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    if (!isBackupFileActiveForListing(data)) continue;
    if (!isPersonalScopeFileDoc(data)) continue;
    totalBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }

  const profileRef = db.collection("profiles").doc(uid);
  const profileSnap = await profileRef.get();
  const storageQuota =
    profileSnap.exists && typeof profileSnap.data()?.storage_quota_bytes === "number"
      ? profileSnap.data()!.storage_quota_bytes
      : FREE_TIER_STORAGE_BYTES;

  await profileRef.set(
    {
      userId: uid,
      storage_used_bytes: totalBytes,
      storage_quota_bytes: storageQuota,
      storage_recalculated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({
    storage_used_bytes: totalBytes,
    storage_quota_bytes: storageQuota,
  });
}
