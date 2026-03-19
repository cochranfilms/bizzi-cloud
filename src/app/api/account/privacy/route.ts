/**
 * GET /api/account/privacy - Return user's privacy preferences
 * PATCH /api/account/privacy - Update privacy preferences (do_not_sell, cookie_consent)
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { NextResponse } from "next/server";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(auth.uid).get();
  const data = profileSnap.data() ?? {};

  return NextResponse.json({
    do_not_sell_personal_info: data.do_not_sell_personal_info === true,
    cookie_consent: data.cookie_consent ?? { essential: true, analytics: false, functional: false },
    privacy_preferences_updated_at: data.privacy_preferences_updated_at?.toDate?.()?.toISOString?.() ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`privacy:${auth.uid}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { do_not_sell_personal_info?: boolean; cookie_consent?: { essential?: boolean; analytics?: boolean; functional?: boolean } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const profileRef = db.collection("profiles").doc(auth.uid);
  const updates: Record<string, unknown> = {};
  const now = new Date();

  if (typeof body.do_not_sell_personal_info === "boolean") {
    updates.do_not_sell_personal_info = body.do_not_sell_personal_info;
  }
  if (body.cookie_consent && typeof body.cookie_consent === "object") {
    const cc = body.cookie_consent;
    updates.cookie_consent = {
      essential: cc.essential !== false,
      analytics: cc.analytics === true,
      functional: cc.functional === true,
    };
  }

  if (Object.keys(updates).length > 0) {
    updates.privacy_preferences_updated_at = now;
    await profileRef.set(updates, { merge: true });
    await writeAuditLog({
      action: "privacy_preferences_update",
      uid: auth.uid,
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? null,
      metadata: { updated: Object.keys(updates) },
    });
  }

  return NextResponse.json({ ok: true });
}
