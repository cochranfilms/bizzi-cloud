/**
 * Stripe server-side instance. Use for API routes only.
 * Requires STRIPE_SECRET_KEY in environment.
 */
import Stripe from "stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(key);
}

let stripe: Stripe | null = null;

export function getStripeInstance(): Stripe {
  if (!stripe) {
    stripe = getStripe();
  }
  return stripe;
}
