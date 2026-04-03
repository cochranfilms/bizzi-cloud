import { getStripeInstance } from "@/lib/stripe";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
  getOrCreateStripeStorageAddonPrice,
  getOrCreatePersonalTeamSeatPrice,
} from "@/lib/stripe-prices";
import {
  coerceTeamSeatCounts,
  emptyTeamSeatCounts,
  sumExtraTeamSeats,
  teamSeatCountsToMetadataStrings,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  applyBizziSubscriptionConnectConfigToSubscriptionData,
  buildBizziSubscriptionConnectConfig,
  cochranConnectJsonLog,
  resolveCochranConnectDestination,
} from "@/lib/stripe-connect-cochran";
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
    /** Personal team seats: extra seats per access tier (optional; legacy seatCount still accepted) */
    teamSeatCounts?: {
      none?: number;
      gallery?: number;
      editor?: number;
      fullframe?: number;
    };
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
  const seatCountLegacy = typeof body.seatCount === "number" && body.seatCount >= 1
    ? Math.min(Math.floor(body.seatCount), 10)
    : 1;
  let teamSeatCounts = coerceTeamSeatCounts(body.teamSeatCounts);
  if (sumExtraTeamSeats(teamSeatCounts) === 0 && seatCountLegacy > 1) {
    teamSeatCounts = coerceTeamSeatCounts({
      none: seatCountLegacy - 1,
      gallery: 0,
      editor: 0,
      fullframe: 0,
    });
  }
  const seatCount = 1 + sumExtraTeamSeats(teamSeatCounts);
  const teamMeta = teamSeatCountsToMetadataStrings(teamSeatCounts);
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
  const countsForCheckout = allowsSeats ? teamSeatCounts : emptyTeamSeatCounts();
  if (!allowsSeats && sumExtraTeamSeats(teamSeatCounts) > 0) {
    return NextResponse.json(
      { error: "This plan does not support team seats." },
      { status: 400 }
    );
  }

  const tierOrder: PersonalTeamSeatAccess[] = [
    "none",
    "gallery",
    "editor",
    "fullframe",
  ];
  for (const tier of tierOrder) {
    const qty = countsForCheckout[tier];
    if (qty <= 0) continue;
    try {
      const priceId = await getOrCreatePersonalTeamSeatPrice(tier, billing);
      lineItems.push({ price: priceId, quantity: qty });
    } catch (err) {
      console.error("[Stripe checkout] Team seat price failed:", tier, err);
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
  const db = getAdminFirestore();

  const metadata: Record<string, string> = {
    planId,
    addonIds: addonIds.join(","),
    billing,
    seat_count: teamMeta.seat_count,
    team_seats_none: teamMeta.team_seats_none,
    team_seats_gallery: teamMeta.team_seats_gallery,
    team_seats_editor: teamMeta.team_seats_editor,
    team_seats_fullframe: teamMeta.team_seats_fullframe,
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
    const profileSnap = await db.collection("profiles").doc(uid).get();
    stripeCustomerId = profileSnap.data()?.stripe_customer_id as string | undefined;
  }

  /**
   * Cochran Connect 60/40 split applies ONLY here:
   * - `mode: "subscription"` consumer signup on this route (/api/stripe/checkout).
   * Do NOT call these helpers from one-time payment checkouts, enterprise/org billing,
   * standalone add-on or team-seat flows, or invoice-only paths unless product explicitly extends scope.
   *
   * v1 does not set on_behalf_of (platform is merchant of record; see stripe-connect-cochran.ts).
   */
  const cochranResolution = await resolveCochranConnectDestination(stripe, db, async (operatorEmail) => {
    try {
      const r = await getAdminAuth().getUserByEmail(operatorEmail);
      return { uid: r.uid };
    } catch {
      return null;
    }
  });
  if (cochranResolution.mode === "platform_only") {
    console.warn(
      cochranConnectJsonLog({
        action: "subscription_checkout_platform_only",
        reason: cochranResolution.reason,
        ...cochranResolution.logFields,
      })
    );
  }
  const cochranConfig = buildBizziSubscriptionConnectConfig(metadata, cochranResolution);
  const subscription_data = applyBizziSubscriptionConnectConfigToSubscriptionData(metadata, cochranConfig);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: email ?? undefined }),
      success_url: successUrl,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      metadata,
      subscription_data,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    // Store pending checkout for abandonment tracking
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
