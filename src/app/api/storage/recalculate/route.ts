import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { quotaCountedSizeBytesFromBackupFile } from "@/lib/backup-file-lifecycle";
import { isPersonalScopeFileDoc } from "@/lib/backup-scope";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

/**
 * Writes cached display totals on the user profile (`storage_used_bytes` for the solo-personal scope bar).
 *
 * This is for UI reconciliation and reporting only. It is NOT the authoritative upload enforcement path:
 * quota checks must use live Firestore aggregation (see enterprise-storage / quota service), not this field alone.
 *
 * Does not touch storage_quota_reservations; pending uploads still affect enforcement via the storage status APIs.
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
    if (!isPersonalScopeFileDoc(data)) continue;
    totalBytes += quotaCountedSizeBytesFromBackupFile(data);
  }

  const profileRef = db.collection("profiles").doc(uid);
  const profileSnap = await profileRef.get();
  const storageQuota =
    profileSnap.exists && typeof profileSnap.data()?.storage_quota_bytes === "number"
      ? profileSnap.data()!.storage_quota_bytes
      : FREE_TIER_STORAGE_BYTES;

  const prevUsed =
    profileSnap.exists && typeof profileSnap.data()?.storage_used_bytes === "number"
      ? profileSnap.data()!.storage_used_bytes
      : null;
  if (
    prevUsed !== null &&
    typeof totalBytes === "number" &&
    Math.abs(totalBytes - prevUsed) >= 1024 * 1024
  ) {
    console.info("[storage/recalculate] profile delta", {
      uid,
      previous_storage_used_bytes: prevUsed,
      new_storage_used_bytes: totalBytes,
    });
  }

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
