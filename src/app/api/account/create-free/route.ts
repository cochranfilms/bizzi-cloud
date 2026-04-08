/**
 * POST /api/account/create-free
 * Creates a profile for the current Firebase user with plan_id: free.
 * Call after client-side createUserWithEmailAndPassword.
 * Requires Authorization: Bearer <idToken>.
 */
import {
  getAdminFirestore,
  verifyIdToken,
} from "@/lib/firebase-admin";
import {
  getStorageBytesForPlan,
} from "@/lib/plan-constants";
import { ensureDefaultDrivesForUser } from "@/lib/ensure-default-drives";
import { NextResponse } from "next/server";

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

  let decoded: { uid: string; email?: string };
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token. Sign out and try again." },
      { status: 401 }
    );
  }

  const uid = decoded.uid;

  let body: { display_name?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const displayName =
    typeof body.display_name === "string" ? body.display_name.trim() || null : null;

  const db = getAdminFirestore();
  const profileRef = db.collection("profiles").doc(uid);
  const profileSnap = await profileRef.get();

  if (profileSnap.exists) {
    return NextResponse.json(
      { error: "Profile already exists. Sign in to access your dashboard." },
      { status: 400 }
    );
  }

  const storageQuotaBytes = getStorageBytesForPlan("free");

  await profileRef.set(
    {
      userId: uid,
      plan_id: "free",
      addon_ids: [],
      storage_quota_bytes: storageQuotaBytes,
      storage_used_bytes: 0,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_updated_at: null,
      display_name: displayName,
      workspace_onboarding_status: "pending",
      workspace_onboarding_version: 1,
    },
    { merge: true }
  );

  await ensureDefaultDrivesForUser(uid);

  return NextResponse.json({ ok: true });
}
