import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { NextResponse } from "next/server";

const RETURN_PATHS = {
  dashboard_settings: "/dashboard/settings",
  enterprise_settings: "/enterprise/settings#subscription",
  change_plan: "/dashboard/change-plan",
} as const;

type ReturnPathKey = keyof typeof RETURN_PATHS;

const VALID_RETURN_KEYS = new Set<string>(Object.keys(RETURN_PATHS));

function parsePortalBody(raw: string): {
  customer_context?: string;
  return_path?: string;
} {
  if (!raw.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const o = v as Record<string, unknown>;
    return {
      customer_context:
        typeof o.customer_context === "string" ? o.customer_context : undefined,
      return_path: typeof o.return_path === "string" ? o.return_path : undefined,
    };
  } catch {
    return {};
  }
}

function resolveReturnUrl(baseUrl: string, key: ReturnPathKey): string {
  return `${baseUrl}${RETURN_PATHS[key]}`;
}

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

  const text = await request.text();
  const body = parsePortalBody(text);
  const ctxRaw = body.customer_context;
  const customerContext: "auto" | "profile" | "organization" =
    ctxRaw === "profile" || ctxRaw === "organization" || ctxRaw === "auto"
      ? ctxRaw
      : "auto";

  const explicitReturn =
    body.return_path && VALID_RETURN_KEYS.has(body.return_path)
      ? (body.return_path as ReturnPathKey)
      : undefined;

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data() ?? {};
  const profileCustomerId = profileData.stripe_customer_id as string | undefined;
  const orgId = profileData.organization_id as string | undefined;

  let stripeCustomerId: string | null = null;
  let resolvedContext: "profile" | "organization" = "profile";

  if (customerContext === "profile") {
    stripeCustomerId = profileCustomerId ?? null;
    resolvedContext = "profile";
  } else if (customerContext === "organization") {
    if (!orgId) {
      return NextResponse.json(
        { error: "Not an organization member" },
        { status: 400 }
      );
    }
    const access = await resolveEnterpriseAccess(uid, orgId);
    if (!access.isAdmin) {
      return NextResponse.json(
        { error: "Only organization admins can open organization billing" },
        { status: 403 }
      );
    }
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgCustomer = orgSnap.data()?.stripe_customer_id as string | undefined;
    if (!orgCustomer) {
      return NextResponse.json(
        {
          error:
            "Organization billing is not on Stripe yet. Contact sales to manage payment methods.",
        },
        { status: 400 }
      );
    }
    stripeCustomerId = orgCustomer;
    resolvedContext = "organization";
  } else {
    if (profileCustomerId) {
      stripeCustomerId = profileCustomerId;
      resolvedContext = "profile";
    } else if (orgId) {
      const access = await resolveEnterpriseAccess(uid, orgId);
      const orgSnap = await db.collection("organizations").doc(orgId).get();
      const orgCustomer = orgSnap.data()?.stripe_customer_id as string | undefined;
      if (access.isAdmin && orgCustomer) {
        stripeCustomerId = orgCustomer;
        resolvedContext = "organization";
      }
    }
  }

  if (!stripeCustomerId) {
    return NextResponse.json(
      {
        error:
          "No Stripe billing profile found. Upgrade from the pricing page, or contact sales for organization billing.",
      },
      { status: 400 }
    );
  }

  const returnKey: ReturnPathKey =
    explicitReturn ??
    (resolvedContext === "organization"
      ? "enterprise_settings"
      : "dashboard_settings");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    request.headers.get("origin") ??
    "http://localhost:3000";

  const returnUrl = resolveReturnUrl(baseUrl, returnKey);

  const stripe = getStripeInstance();

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
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
