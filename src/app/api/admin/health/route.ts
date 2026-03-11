/**
 * GET /api/admin/health
 * Returns real platform health checks (Firestore, Stripe connectivity).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const checks: Array<{
    id: string;
    name: string;
    status: "healthy" | "warning" | "critical";
    lastCheck: string;
    latencyMs?: number;
  }> = [];
  const now = new Date().toISOString();

  try {
    const start = Date.now();
    const db = getAdminFirestore();
    await db.collection("profiles").limit(1).get();
    const latencyMs = Date.now() - start;
    checks.push({
      id: "database",
      name: "Database",
      status: latencyMs < 1000 ? "healthy" : latencyMs < 3000 ? "warning" : "critical",
      lastCheck: now,
      latencyMs,
    });
  } catch (err) {
    checks.push({
      id: "database",
      name: "Database",
      status: "critical",
      lastCheck: now,
    });
  }

  try {
    const start = Date.now();
    const stripe = getStripeInstance();
    await stripe.balance.retrieve();
    const latencyMs = Date.now() - start;
    checks.push({
      id: "payments",
      name: "Payment system",
      status: latencyMs < 2000 ? "healthy" : "warning",
      lastCheck: now,
      latencyMs,
    });
  } catch (err) {
    checks.push({
      id: "payments",
      name: "Payment system",
      status: "critical",
      lastCheck: now,
    });
  }

  checks.push({
    id: "api",
    name: "API",
    status: "healthy",
    lastCheck: now,
    latencyMs: 0,
  });

  return NextResponse.json({ checks });
}
