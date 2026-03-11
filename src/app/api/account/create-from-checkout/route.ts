/**
 * POST /api/account/create-from-checkout
 * Creates a Firebase user and profile from a completed Stripe checkout session.
 * Called by /account/setup after guest checkout payment success.
 */
import { getStripeInstance } from "@/lib/stripe";
import {
  getAdminAuth,
  getAdminFirestore,
} from "@/lib/firebase-admin";
import {
  getStorageBytesForPlan,
  type PlanId,
} from "@/lib/plan-constants";
import { ensureDefaultDrivesForUser } from "@/lib/ensure-default-drives";
import Stripe from "stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: { session_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const sessionId = body.session_id;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json(
      { error: "Missing session_id" },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer"],
    });
  } catch (err) {
    console.error("[create-from-checkout] Failed to retrieve session:", err);
    return NextResponse.json(
      { error: "Invalid or expired checkout session" },
      { status: 400 }
    );
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment not completed" },
      { status: 400 }
    );
  }

  const metadata = session.metadata ?? {};
  const userId = metadata.userId as string | undefined;
  const customerEmail = (metadata.customer_email ?? session.customer_email) as
    | string
    | undefined;

  // Guest checkout: no userId, has customer_email
  if (!userId && !customerEmail) {
    return NextResponse.json(
      { error: "Checkout session missing customer info" },
      { status: 400 }
    );
  }

  // Already has userId = existing user, webhook would have handled profile
  if (userId) {
    return NextResponse.json(
      {
        error: "Account already exists. Sign in to access your dashboard.",
        existing_user: true,
      },
      { status: 400 }
    );
  }

  const planId = (metadata.planId ?? "solo") as PlanId;
  const addonIdsRaw = metadata.addonIds ?? "";
  const addonIds = addonIdsRaw
    ? (addonIdsRaw as string).split(",").filter(Boolean)
    : [];

  const auth = getAdminAuth();
  const db = getAdminFirestore();

  let uid: string;
  try {
    const userRecord = await auth.createUser({
      email: customerEmail,
      emailVerified: true,
      password: Math.random().toString(36).slice(2, 18) + "A1!",
    });
    uid = userRecord.uid;
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err
      ? (err as { code?: string }).code
      : null;
    if (code === "auth/email-already-exists") {
      const existingUser = await auth.getUserByEmail(customerEmail!);
      uid = existingUser.uid;
    } else {
      console.error("[create-from-checkout] createUser error:", err);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }
  }

  const storageQuotaBytes = getStorageBytesForPlan(planId);

  await db.collection("profiles").doc(uid).set(
    {
      userId: uid,
      plan_id: planId,
      addon_ids: addonIds,
      storage_quota_bytes: storageQuotaBytes,
      storage_used_bytes: 0,
      stripe_customer_id: session.customer ?? null,
      stripe_subscription_id: session.subscription ?? null,
      stripe_updated_at: new Date().toISOString(),
    },
    { merge: true }
  );

  await ensureDefaultDrivesForUser(uid);

  // Mark pending_checkouts as completed
  const pendingRef = db.collection("pending_checkouts").doc(sessionId);
  const pendingSnap = await pendingRef.get();
  if (pendingSnap.exists) {
    await pendingRef.update({ status: "completed" });
  }

  let customToken: string;
  try {
    customToken = await auth.createCustomToken(uid);
  } catch (err) {
    console.error("[create-from-checkout] createCustomToken error:", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }

  return NextResponse.json({ customToken });
}
