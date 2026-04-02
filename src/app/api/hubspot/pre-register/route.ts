import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/audit-log";
import {
  buildWaitlistSubmissionDetailsHtml,
  sendWaitlistAdminNotificationEmail,
  sendWaitlistClientEmail,
} from "@/lib/emailjs";
import { buildHubSpotFields } from "@/lib/hubspot-pre-register-fields";
import { checkRateLimit } from "@/lib/rate-limit";
import { preRegistrationBodySchema } from "@/lib/pre-registration-schema";
import { SITE_URL, WAITLIST_PATH } from "@/lib/seo";
import { splitFullName } from "@/lib/split-full-name";

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
          pageName: "Bizzi Cloud Waitlist",
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

  try {
    const submittedAt = new Date();
    const submittedAtFormatted = submittedAt.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const submissionDetailsHtml = buildWaitlistSubmissionDetailsHtml(parsed.data, submittedAt);
    const { firstname } = splitFullName(parsed.data.fullName);
    const waitlistUrl = `${SITE_URL}${WAITLIST_PATH}`;
    await Promise.all([
      sendWaitlistAdminNotificationEmail({
        admin_email: process.env.WAITLIST_ADMIN_NOTIFY_EMAIL?.trim() ?? "",
        full_name: parsed.data.fullName,
        submitter_email: parsed.data.email,
        submission_details_html: submissionDetailsHtml,
        submitted_at_formatted: submittedAtFormatted,
      }),
      sendWaitlistClientEmail({
        submitter_email: parsed.data.email,
        first_name: firstname || "there",
        submission_details_html: submissionDetailsHtml,
        submitted_at_formatted: submittedAtFormatted,
        waitlist_url: waitlistUrl,
      }),
    ]);
  } catch (mailErr) {
    console.error("[hubspot/pre-register] waitlist EmailJS send failed", mailErr);
  }

  return NextResponse.json({ ok: true as const });
}
