import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";

/** GET - Current user's storage quota and used (for enterprise users). */
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

  const seatId = `${orgId}_${uid}`;
  const seatSnap = await db.collection("organization_seats").doc(seatId).get();
  const seatData = seatSnap.data();
  const seatQuota = seatData?.storage_quota_bytes;
  const storageQuotaBytes =
    typeof seatQuota === "number"
      ? seatQuota
      : seatQuota === null
        ? null
        : DEFAULT_SEAT_STORAGE_BYTES;

  const filesSnap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
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
