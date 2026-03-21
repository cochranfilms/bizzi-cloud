import { getStripeInstance } from "@/lib/stripe";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
  getOrCreateStripeSeatPrice,
  getOrCreateStripeStorageAddonPrice,
} from "@/lib/stripe-prices";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  let body: {
    planId?: string;
    addonId?: string;
    addonIds?: string[];
    billing?: string;
    seatCount?: number;
    storageAddonId?: string | null;
    email?: string;
    name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const planId = body.planId as PlanId | undefined;
  const addonId = body.addonId as AddonId | undefined;
  const addonIdsRaw = Array.isArray(body.addonIds) ? body.addonIds : [];
  const addonIdsFromBody = addonIdsRaw.filter(
    (id): id is AddonId => typeof id === "string" && ["gallery", "editor", "fullframe"].includes(id)
  );
  const billing = (body.billing === "annual" ? "annual" : "monthly") as BillingCycle;
  const seatCount = typeof body.seatCount === "number" && body.seatCount >= 1
    ? Math.min(Math.floor(body.seatCount), 10)
    : 1;
  const storageAddonId = body.storageAddonId && typeof body.storageAddonId === "string"
    ? body.storageAddonId
    : null;

  const validPlanIds = ["solo", "indie", "video", "production"];
  if (!planId || !validPlanIds.includes(planId)) {
    return NextResponse.json(
      { error: "Invalid or missing planId" },
      { status: 400 }
    );
  }

  const isGuestCheckout =
    !token &&
    typeof body.email === "string" &&
    body.email.trim().length > 0 &&
    typeof body.name === "string" &&
    body.name.trim().length > 0;

  let uid: string | null = null;
  let email: string | undefined;

  if (isGuestCheckout) {
    email = (body.email as string).trim();
  } else {
    if (!token) {
      return NextResponse.json(
        { error: "Sign in required to purchase" },
        { status: 401 }
      );
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  let priceId: string;
  try {
    priceId = await getOrCreateStripePrice(
      planId as Exclude<PlanId, "free">,
      billing
    );
  } catch (err) {
    console.error("[Stripe checkout] Failed to get/create price:", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: priceId, quantity: 1 },
  ];
  const addonIds = addonIdsFromBody.length > 0 ? addonIdsFromBody : (addonId ? [addonId] : []);

  for (const aid of addonIds) {
    try {
      const addonPriceId = await getOrCreateStripeAddonPrice(aid);
      lineItems.push({ price: addonPriceId, quantity: 1 });
    } catch (err) {
      console.error("[Stripe checkout] Failed to get/create addon price:", err);
      return NextResponse.json(
        { error: "Checkout failed. Please try again." },
        { status: 500 }
      );
    }
  }

  const VALID_STORAGE_ADDON_IDS = [
    "indie_1", "indie_2", "indie_3",
    "video_1", "video_2", "video_3", "video_4", "video_5",
  ];
  const STORAGE_ADDON_PLAN_MAP: Record<string, string> = {
    indie_1: "indie", indie_2: "indie", indie_3: "indie",
    video_1: "video", video_2: "video", video_3: "video", video_4: "video", video_5: "video",
  };
  if (storageAddonId && VALID_STORAGE_ADDON_IDS.includes(storageAddonId) && STORAGE_ADDON_PLAN_MAP[storageAddonId] === planId) {
    try {
      const storagePriceId = await getOrCreateStripeStorageAddonPrice(storageAddonId as import("@/lib/pricing-data").StorageAddonId);
      lineItems.push({ price: storagePriceId, quantity: 1 });
    } catch (err) {
      console.error("[Stripe checkout] Failed to get storage addon price:", err);
      return NextResponse.json(
        { error: "Checkout failed. Please try again." },
        { status: 500 }
      );
    }
  }

  const allowsSeats = ["indie", "video", "production"].includes(planId);
  const extraSeats = allowsSeats ? Math.max(0, seatCount - 1) : 0;
  if (extraSeats > 0) {
    try {
      const seatPriceId = await getOrCreateStripeSeatPrice();
      lineItems.push({ price: seatPriceId, quantity: extraSeats });
    } catch (err) {
      console.error("[Stripe checkout] Failed to get/create seat price:", err);
      return NextResponse.json(
        { error: "Checkout failed. Please try again." },
        { status: 500 }
      );
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    request.headers.get("origin") ??
    "http://localhost:3000";

  const stripe = getStripeInstance();

  const metadata: Record<string, string> = {
    planId,
    addonIds: addonIds.join(","),
    billing,
    seat_count: String(seatCount),
    ...(storageAddonId ? { storageAddonId } : {}),
  };

  if (isGuestCheckout) {
    metadata.customer_email = email!;
    metadata.customer_name = (body.name as string).trim();
  } else {
    metadata.userId = uid!;
  }

  const successUrl = isGuestCheckout
    ? `${baseUrl}/account/setup?session_id={CHECKOUT_SESSION_ID}`
    : `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;

  // Reuse existing Stripe customer for returning users (e.g. after account delete + restore)
  let stripeCustomerId: string | undefined;
  if (!isGuestCheckout && uid) {
    const db = getAdminFirestore();
    const profileSnap = await db.collection("profiles").doc(uid).get();
    stripeCustomerId = profileSnap.data()?.stripe_customer_id as string | undefined;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: email ?? undefined }),
      success_url: successUrl,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      metadata,
      subscription_data: {
        metadata: { ...metadata },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    // Store pending checkout for abandonment tracking
    const db = getAdminFirestore();
    await db.collection("pending_checkouts").doc(session.id).set({
      email: email ?? null,
      name: isGuestCheckout ? (body.name as string).trim() : null,
      plan_id: planId,
      billing,
      addon_id: addonId ?? null,
      stripe_session_id: session.id,
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
      user_id: uid,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[Stripe checkout error]", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }
}
