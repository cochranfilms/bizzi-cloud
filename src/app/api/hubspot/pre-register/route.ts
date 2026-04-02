import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/audit-log";
import { buildHubSpotFields } from "@/lib/hubspot-pre-register-fields";
import { checkRateLimit } from "@/lib/rate-limit";
import { preRegistrationBodySchema } from "@/lib/pre-registration-schema";

const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX = 30;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_MAX = 5;

export async function POST(request: Request) {
  const ip = getClientIp(request) ?? "unknown";
  const ipRl = checkRateLimit(`pre_reg_ip:${ip}`, IP_MAX, IP_WINDOW_MS);
  if (!ipRl.allowed) {
    return NextResponse.json(
      { ok: false as const, error: "Too many submissions. Try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false as const, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = preRegistrationBodySchema.safeParse(body);
  if (!parsed.success) {
    const msg =
      parsed.error.issues.map((i) => i.message).join(" ") || "Please check the form and try again.";
    return NextResponse.json({ ok: false as const, error: msg }, { status: 400 });
  }

  const emailNorm = parsed.data.email.trim().toLowerCase();
  const emailRl = checkRateLimit(`pre_reg_email:${emailNorm}`, EMAIL_MAX, EMAIL_WINDOW_MS);
  if (!emailRl.allowed) {
    return NextResponse.json(
      { ok: false as const, error: "Too many submissions for this email. Try again later." },
      { status: 429 },
    );
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  const formId = process.env.HUBSPOT_FORM_ID;
  if (!token || !portalId || !formId) {
    console.error("[hubspot/pre-register] Missing HUBSPOT_ACCESS_TOKEN, HUBSPOT_PORTAL_ID, or HUBSPOT_FORM_ID");
    return NextResponse.json(
      { ok: false as const, error: "Registration is temporarily unavailable." },
      { status: 503 },
    );
  }

  const leadSource = process.env.HUBSPOT_LEAD_SOURCE ?? "Bizzi Cloud Pre Registration";
  const fields = buildHubSpotFields(parsed.data, leadSource);
  const url = `https://api.hsforms.com/submissions/v3/integration/secure/submit/${portalId}/${formId}`;

  try {
    const hsRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fields,
        context: {
          pageUri: request.headers.get("referer") ?? "https://bizzicloud.io/",
          pageName: "Bizzi Cloud Pre-Registration",
        },
      }),
    });

    if (!hsRes.ok) {
      const text = await hsRes.text();
      console.error("[hubspot/pre-register] HubSpot error", hsRes.status, text.slice(0, 500));
      return NextResponse.json(
        { ok: false as const, error: "Could not complete registration. Try again shortly." },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[hubspot/pre-register] fetch failed", err);
    return NextResponse.json(
      { ok: false as const, error: "Could not complete registration. Try again shortly." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true as const });
}
