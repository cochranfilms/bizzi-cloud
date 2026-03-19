/**
 * POST /api/account/set-password-from-checkout
 * Sets password for a user created via guest checkout, then returns a custom token.
 * Called after create-from-checkout when needsPassword is true.
 */
import { getStripeInstance } from "@/lib/stripe";
import { getAdminAuth } from "@/lib/firebase-admin";
import Stripe from "stripe";
import { NextResponse } from "next/server";

const MIN_PASSWORD_LENGTH = 6;

export async function POST(request: Request) {
  let body: { session_id?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const sessionId = body.session_id;
  const password = typeof body.password === "string" ? body.password.trim() : "";

  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json(
      { error: "Missing session_id" },
      { status: 400 }
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error("[set-password-from-checkout] Failed to retrieve session:", err);
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

  // Only for guest checkout (no userId)
  if (userId) {
    return NextResponse.json(
      { error: "Account already has credentials. Please sign in." },
      { status: 400 }
    );
  }

  if (!customerEmail) {
    return NextResponse.json(
      { error: "Checkout session missing customer info" },
      { status: 400 }
    );
  }

  const auth = getAdminAuth();
  let uid: string;
  try {
    const userRecord = await auth.getUserByEmail(customerEmail);
    uid = userRecord.uid;
  } catch (err) {
    console.error("[set-password-from-checkout] getUserByEmail error:", err);
    return NextResponse.json(
      { error: "User not found. Please complete account setup first." },
      { status: 400 }
    );
  }

  try {
    await auth.updateUser(uid, { password });
  } catch (err) {
    console.error("[set-password-from-checkout] updateUser error:", err);
    return NextResponse.json(
      { error: "Failed to set password. Please try again." },
      { status: 500 }
    );
  }

  let customToken: string;
  try {
    customToken = await auth.createCustomToken(uid);
  } catch (err) {
    console.error("[set-password-from-checkout] createCustomToken error:", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }

  return NextResponse.json({ customToken });
}
