import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

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

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const stripeCustomerId = profileSnap.data()?.stripe_customer_id as
    | string
    | undefined;

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "No subscription found. Upgrade from the pricing page." },
      { status: 400 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    request.headers.get("origin") ??
    "http://localhost:3000";

  const stripe = getStripeInstance();

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${baseUrl}/dashboard/settings`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create portal session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[Stripe portal error]", err);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 }
    );
  }
}
