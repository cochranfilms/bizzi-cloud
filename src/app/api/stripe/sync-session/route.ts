import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { getStorageBytesForPlan, type PlanId } from "@/lib/plan-constants";
import { ensureDefaultDrivesForUser } from "@/lib/ensure-default-drives";
import { restoreColdStorageToHot } from "@/lib/cold-storage-restore";
import Stripe from "stripe";
import { NextResponse } from "next/server";

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & { price: Stripe.Price };

function computeStorageFromSubscription(
  planId: PlanId,
  items: SubscriptionItemWithPrice[]
): { storageQuotaBytes: number; storageAddonId: string | null } {
  let storageAddonTb = 0;
  let storageAddonId: string | null = null;
  for (const item of items) {
    if (item.deleted) continue;
    const meta = item.price?.metadata;
    const addonId = meta?.storage_addon_id as string | undefined;
    const tb = meta?.storage_addon_tb ? parseInt(String(meta.storage_addon_tb), 10) : 0;
    if (addonId && !isNaN(tb) && tb > 0) {
      storageAddonTb += tb;
      storageAddonId = addonId;
    }
  }
  const baseBytes = getStorageBytesForPlan(planId);
  const addonBytes = storageAddonTb * 1024 ** 4;
  return {
    storageQuotaBytes: baseBytes + addonBytes,
    storageAddonId,
  };
}

/**
 * Sync profile from a completed Stripe Checkout session.
 * Use when webhook fails (e.g. 307 redirect) - call after redirect to success URL.
 * Stripe replaces {CHECKOUT_SESSION_ID} in success_url, so client has session_id.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Sign in required" },
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

  let body: { session_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const sessionId =
    typeof body.session_id === "string" ? body.session_id.trim() : "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "session_id required" },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
  } catch (err) {
    console.error("[Stripe sync-session] Failed to retrieve:", err);
    return NextResponse.json(
      { error: "Invalid or expired checkout session" },
      { status: 400 }
    );
  }

  const metaUserId = session.metadata?.userId as string | undefined;
  if (!metaUserId || metaUserId !== uid) {
    return NextResponse.json(
      { error: "Session does not belong to this account" },
      { status: 403 }
    );
  }

  if (session.status !== "complete") {
    return NextResponse.json(
      { error: "Checkout was not completed" },
      { status: 400 }
    );
  }

  const planId = session.metadata?.planId as PlanId | undefined;
  if (!planId) {
    return NextResponse.json(
      { error: "Session missing plan metadata" },
      { status: 400 }
    );
  }

  const addonIdsRaw = session.metadata?.addonIds ?? "";
  const addonIds: string[] = addonIdsRaw.split(",").filter(Boolean);
  const seatCountRaw = session.metadata?.seat_count;
  const seatCount =
    typeof seatCountRaw === "string" && /^\d+$/.test(seatCountRaw)
      ? parseInt(seatCountRaw, 10)
      : 1;
  let storageQuotaBytes = getStorageBytesForPlan(planId);
  let storageAddonId: string | null = null;
  const subId: string | null =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null;
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["items.data.price"],
      });
      const items = sub.items.data as SubscriptionItemWithPrice[];
      const computed = computeStorageFromSubscription(planId, items);
      storageQuotaBytes = computed.storageQuotaBytes;
      storageAddonId = computed.storageAddonId;
    } catch (err) {
      console.error("[Stripe sync-session] Failed to expand subscription:", err);
    }
  }

  const db = getAdminFirestore();
  await db.collection("profiles").doc(uid).set(
    {
      userId: uid,
      plan_id: planId,
      addon_ids: addonIds,
      seat_count: seatCount,
      storage_quota_bytes: storageQuotaBytes,
      storage_addon_id: storageAddonId,
      stripe_customer_id: session.customer ?? null,
      stripe_subscription_id: subId,
      stripe_updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
  await ensureDefaultDrivesForUser(uid);

  // Restore cold storage if user has files (e.g. after account delete + resubscribe). Idempotent.
  try {
    await restoreColdStorageToHot({ type: "consumer", userId: uid });
  } catch (err) {
    console.error("[Stripe sync-session] Cold storage restore failed:", err);
  }

  return NextResponse.json({
    ok: true,
    plan_id: planId,
    storage_quota_bytes: storageQuotaBytes,
  });
}
