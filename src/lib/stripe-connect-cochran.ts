/**
 * Cochran Films Stripe Connect (Express, Account Links — not OAuth).
 *
 * Bizzi Cloud keeps 60% of subscription invoice totals; the connected Express
 * account receives the remainder via destination charges on /api/stripe/checkout
 * only (mode: subscription). Do not reuse these helpers for one-time checkouts,
 * enterprise billing, or invoice-only flows without an explicit product decision.
 *
 * v1 does NOT set on_behalf_of. Adding it later changes statement-descriptor and
 * merchant-of-record behavior for customers (see Stripe destination charges).
 */
import {
  COCHRAN_CONNECT_OPERATOR_EMAIL,
  isCochranConnectOperatorEmail,
} from "@/lib/cochran-connect-operator";
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

export { COCHRAN_CONNECT_OPERATOR_EMAIL, isCochranConnectOperatorEmail };

export type CochranConnectVerifiedRequest =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 403; error: string; log?: Record<string, unknown> };

/**
 * Server routes: map token → operator-only access (info@cochranfilms.com).
 */
export async function verifyCochranConnectOperatorRequest(
  authHeader: string | null,
  verifyIdToken: (token: string) => Promise<{ uid: string; email?: string }>
): Promise<CochranConnectVerifiedRequest> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { ok: false, status: 401, error: "Sign in required" };
  }
  let uid: string;
  let email: string | undefined;
  try {
    const d = await verifyIdToken(token);
    uid = d.uid;
    email = d.email;
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  if (!isCochranConnectOperatorEmail(email)) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
      log: { action: "connect_route_denied", uid, reason: "forbidden_email" },
    };
  }
  return { ok: true, uid };
}

/** Stripe Connect account ID shape */
const STRIPE_CONNECT_ACCOUNT_ID_RE = /^acct_[a-zA-Z0-9]+$/;

export type CochranConnectCapabilityStatus = "active" | "inactive" | "pending" | "unrequested" | string;

export type CochranConnectNormalizedCapabilities = {
  card_payments: CochranConnectCapabilityStatus;
  transfers: CochranConnectCapabilityStatus;
};

export type CochranConnectDestinationResolution =
  | {
      mode: "platform_only";
      reason: string;
      logFields?: Record<string, string | undefined>;
    }
  | {
      mode: "destination_ready";
      destination: string;
      stripe_account: Stripe.Account;
    };

export type BizziSubscriptionConnectConfig =
  | { mode: "platform_only" }
  | { mode: "destination_split"; destination: string; application_fee_percent: 60 };

function normalizeCapabilityStatus(
  value: string | undefined
): CochranConnectCapabilityStatus {
  if (value === undefined || value === null || value === "") return "unrequested";
  return value;
}

export function pickCochranConnectNormalizedCapabilities(
  account: Pick<Stripe.Account, "capabilities">
): CochranConnectNormalizedCapabilities {
  const cap = account.capabilities;
  return {
    card_payments: normalizeCapabilityStatus(cap?.card_payments as string | undefined),
    transfers: normalizeCapabilityStatus(cap?.transfers as string | undefined),
  };
}

/**
 * Single source of truth aligned with subscription checkout split gating.
 */
export function deriveCochranStripeConnectOnboardingComplete(
  account: Stripe.Account
): boolean {
  return evaluateCochranConnectDestinationReadiness(account).ok;
}

export function evaluateCochranConnectDestinationReadiness(account: Stripe.Account): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (!account.details_submitted) {
    reasons.push("details_not_submitted");
  }

  const req = account.requirements;
  const currentlyDue = req?.currently_due ?? [];
  if (currentlyDue.length > 0) {
    reasons.push("requirements_currently_due_non_empty");
  }

  const disabledReason = req?.disabled_reason;
  if (disabledReason != null && String(disabledReason).trim() !== "") {
    reasons.push("requirements_disabled_reason_set");
  }

  if (!account.charges_enabled) {
    reasons.push("charges_not_enabled");
  }

  if (!account.payouts_enabled) {
    reasons.push("payouts_not_enabled");
  }

  const cap = pickCochranConnectNormalizedCapabilities(account);
  if (cap.card_payments !== "active") {
    reasons.push(`card_payments_not_active:${cap.card_payments}`);
  }
  if (cap.transfers !== "active") {
    reasons.push(`transfers_not_active:${cap.transfers}`);
  }

  return { ok: reasons.length === 0, reasons };
}

export function isWellFormedStripeConnectAccountId(raw: string | undefined | null): boolean {
  if (raw == null || typeof raw !== "string") return false;
  return STRIPE_CONNECT_ACCOUNT_ID_RE.test(raw.trim());
}

/**
 * Loads the Cochran operator profile, retrieves the Connect account from Stripe,
 * and returns destination_ready only when strict readiness passes.
 */
export async function resolveCochranConnectDestination(
  stripe: Stripe,
  db: Firestore,
  getOperatorUserByEmail: (email: string) => Promise<{ uid: string } | null>
): Promise<CochranConnectDestinationResolution> {
  let operatorUid: string | undefined;
  try {
    const op = await getOperatorUserByEmail(COCHRAN_CONNECT_OPERATOR_EMAIL);
    if (!op) {
      return {
        mode: "platform_only",
        reason: "cochran_operator_user_not_found",
      };
    }
    operatorUid = op.uid;
    const profileSnap = await db.collection("profiles").doc(op.uid).get();
    const rawId = profileSnap.data()?.stripe_connect_account_id as string | undefined;
    const accountId = typeof rawId === "string" ? rawId.trim() : "";

    if (!accountId || !isWellFormedStripeConnectAccountId(accountId)) {
      return {
        mode: "platform_only",
        reason: "missing_or_invalid_stripe_connect_account_id",
        logFields: { operator_uid: operatorUid },
      };
    }

    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(accountId);
    } catch {
      return {
        mode: "platform_only",
        reason: "stripe_accounts_retrieve_failed",
        logFields: { operator_uid: operatorUid, stripe_connect_account_id: accountId },
      };
    }

    const readiness = evaluateCochranConnectDestinationReadiness(account);
    if (!readiness.ok) {
      return {
        mode: "platform_only",
        reason: "cochran_connect_not_ready_for_destination_split",
        logFields: {
          operator_uid: operatorUid,
          stripe_connect_account_id: accountId,
          readiness: readiness.reasons.join(","),
        },
      };
    }

    return {
      mode: "destination_ready",
      destination: accountId,
      stripe_account: account,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      mode: "platform_only",
      reason: "resolve_cochran_connect_destination_error",
      logFields: { operator_uid: operatorUid, detail: msg },
    };
  }
}

export function buildBizziSubscriptionConnectConfig(
  _metadata: Record<string, string>,
  resolution: CochranConnectDestinationResolution
): BizziSubscriptionConnectConfig {
  if (resolution.mode === "platform_only") {
    return { mode: "platform_only" };
  }
  return {
    mode: "destination_split",
    destination: resolution.destination,
    application_fee_percent: 60,
  };
}

/**
 * Merge into Checkout Session `subscription_data`.
 * Does not set on_behalf_of (v1 — see module docstring).
 */
export function applyBizziSubscriptionConnectConfigToSubscriptionData(
  metadata: Record<string, string>,
  config: BizziSubscriptionConnectConfig
): Stripe.Checkout.SessionCreateParams.SubscriptionData {
  const base: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { ...metadata },
  };
  if (config.mode === "platform_only") {
    return base;
  }
  return {
    ...base,
    transfer_data: { destination: config.destination },
    /**
     * application_fee_percent: portion of each subscription invoice total retained by the platform (60%).
     * The connected account receives the remainder (~40%) via transfer_data.destination.
     * @see https://docs.stripe.com/connect/subscriptions#collect-fees-on-subscriptions
     * Proration caveat: may not apply to some immediately invoiced proration line items.
     */
    application_fee_percent: config.application_fee_percent,
  };
}

export function buildCochranConnectProfileFieldsFromAccount(
  account: Stripe.Account
): Record<string, unknown> {
  const req = account.requirements;
  const caps = pickCochranConnectNormalizedCapabilities(account);
  const onboardingComplete = deriveCochranStripeConnectOnboardingComplete(account);

  return {
    stripe_connect_charges_enabled: account.charges_enabled,
    stripe_connect_payouts_enabled: account.payouts_enabled,
    stripe_connect_details_submitted: account.details_submitted,
    stripe_connect_disabled_reason: req?.disabled_reason ?? null,
    stripe_connect_requirements_currently_due: req?.currently_due ?? [],
    stripe_connect_requirements_eventually_due: req?.eventually_due ?? [],
    stripe_connect_capabilities: caps,
    stripe_connect_onboarding_complete: onboardingComplete,
    stripe_connect_last_synced_at: new Date().toISOString(),
  };
}

export async function mergeCochranConnectProfileFromStripeAccount(
  db: Firestore,
  account: Stripe.Account
): Promise<void> {
  const connectId = account.id;
  const snap = await db
    .collection("profiles")
    .where("stripe_connect_account_id", "==", connectId)
    .limit(1)
    .get();
  if (snap.empty) return;
  const ref = snap.docs[0].ref;
  const fields = buildCochranConnectProfileFieldsFromAccount(account);
  await ref.set(fields, { merge: true });
}

export function cochranConnectJsonLog(payload: Record<string, unknown>): string {
  return JSON.stringify({ scope: "stripe-connect", ...payload });
}
