/**
 * POST /api/account/create-from-checkout
 * Creates a Firebase user and profile from a completed Stripe checkout session.
 * Called by /account/setup after guest checkout payment success.
 *
 * Email verification: legacy guest sessions (no `userId` in metadata) use Admin
 * `createUser` with `emailVerified: true`. Users who signed up on the client before
 * Stripe (`userId` in metadata) are not provisioned here; they should land on the
 * dashboard already signed in. Client `createUserWithEmailAndPassword` may leave
 * `emailVerified` false until the user verifies — unchanged in this pass.
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
import { computeStorageFromSubscription } from "@/lib/stripe-storage-from-subscription";
import {
  resolveTeamSeatCountsForProfile,
  teamSeatCountsToFirestore,
} from "@/lib/team-seat-pricing";
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

  // Pre-checkout signup: session metadata includes Firebase uid; user should sign in, not set password here.
  if (userId) {
    return NextResponse.json({
      flow: "post_checkout_signed_in",
      userId,
    });
  }

  const planId = (metadata.planId ?? "solo") as PlanId;
  const addonIdsRaw = metadata.addonIds ?? "";
  const addonIds = addonIdsRaw
    ? (addonIdsRaw as string).split(",").filter(Boolean)
    : [];
  const metaRecord = metadata as Record<string, string | undefined>;
  let subscriptionItems:
    | (Stripe.SubscriptionItem & { price: Stripe.Price })[]
    | undefined;
  const subIdForItems =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null;
  if (subIdForItems) {
    try {
      const sub = await stripe.subscriptions.retrieve(subIdForItems, {
        expand: ["items.data.price.product"],
      });
      subscriptionItems = sub.items.data as (Stripe.SubscriptionItem & {
        price: Stripe.Price;
      })[];
    } catch {
      subscriptionItems = undefined;
    }
  }
  const teamResolved = resolveTeamSeatCountsForProfile(
    metaRecord,
    subscriptionItems
  );
  const teamFirestore = teamSeatCountsToFirestore(teamResolved);

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

  let storageQuotaBytes = getStorageBytesForPlan(planId);
  let profileStorageAddonId: string | null = null;
  if (subscriptionItems?.length) {
    const computed = computeStorageFromSubscription(planId, subscriptionItems);
    storageQuotaBytes = computed.storageQuotaBytes;
    profileStorageAddonId = computed.storageAddonId;
  }

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null;

  await db.collection("profiles").doc(uid).set(
    {
      userId: uid,
      plan_id: planId,
      addon_ids: addonIds,
      seat_count: teamFirestore.seat_count,
      team_seat_counts: teamFirestore.team_seat_counts,
      storage_quota_bytes: storageQuotaBytes,
      storage_addon_id: profileStorageAddonId,
      storage_used_bytes: 0,
      stripe_customer_id: session.customer ?? null,
      stripe_subscription_id: subId,
      stripe_updated_at: new Date().toISOString(),
      workspace_onboarding_status: "pending",
      workspace_onboarding_version: 1,
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

  // Guest checkout: require user to set password before signing in
  return NextResponse.json({
    needsPassword: true,
    email: customerEmail,
  });
}
