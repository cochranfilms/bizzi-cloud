/**
 * POST /api/profile/ensure-free
 * Ensures a free user has a profile with 2GB storage quota.
 * Called when StorageBadge detects no profile - creates one so free users
 * are explicitly given the 2GB limit.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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
  const profileRef = db.collection("profiles").doc(uid);
  const profileSnap = await profileRef.get();

  // Only create if profile doesn't exist - don't overwrite existing users
  if (!profileSnap.exists) {
    await profileRef.set(
      {
        userId: uid,
        plan_id: "free",
        storage_quota_bytes: FREE_TIER_STORAGE_BYTES,
        storage_used_bytes: 0,
        workspace_onboarding_status: "pending",
        workspace_onboarding_version: 1,
      },
      { merge: true }
    );
  }

  return NextResponse.json({ ok: true });
}
