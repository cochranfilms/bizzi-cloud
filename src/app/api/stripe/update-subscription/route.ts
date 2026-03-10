import { verifyIdToken } from "@/lib/firebase-admin";
import type { AddonId, BillingCycle } from "@/lib/plan-constants";
import { createChangePlanCheckoutSession } from "@/lib/stripe-checkout-change-plan";
import { NextResponse } from "next/server";

const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"];

/**
 * @deprecated Use /api/stripe/checkout-change-plan instead.
 * Kept for backward compatibility with cached clients - forwards to Checkout flow.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  let body: { planId?: string; addonIds?: string[]; billing?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planId = body.planId ?? "";
  const addonIdsRaw = Array.isArray(body.addonIds) ? body.addonIds : [];
  const addonIds = addonIdsRaw.filter(
    (id): id is AddonId => typeof id === "string" && VALID_ADDON_IDS.includes(id)
  );
  const billing = (body.billing === "annual" ? "annual" : "monthly") as BillingCycle;
  const origin = request.headers.get("origin") ?? "";

  return createChangePlanCheckoutSession({
    uid,
    planId,
    addonIds,
    billing,
    origin,
  });
}
