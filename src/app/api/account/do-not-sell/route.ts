/**
 * POST /api/account/do-not-sell
 * CCPA opt-out: set do_not_sell_personal_info = true.
 * Requires auth. If unauthenticated, returns 401 with message to sign in.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json(
      { error: "Sign in to opt out of sale of your data", requiresAuth: true },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const rl = checkRateLimit(`do-not-sell:${uid}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const db = getAdminFirestore();
  await db.collection("profiles").doc(uid).set(
    {
      do_not_sell_personal_info: true,
      privacy_preferences_updated_at: new Date(),
    },
    { merge: true }
  );

  await writeAuditLog({
    action: "do_not_sell_opt_out",
    uid,
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ ok: true, do_not_sell_personal_info: true });
}
