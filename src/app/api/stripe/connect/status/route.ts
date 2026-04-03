import { getStripeInstance } from "@/lib/stripe";
import {
  buildCochranConnectProfileFieldsFromAccount,
  cochranConnectJsonLog,
  deriveCochranStripeConnectOnboardingComplete,
  mergeCochranConnectProfileFromStripeAccount,
  pickCochranConnectNormalizedCapabilities,
  verifyCochranConnectOperatorRequest,
} from "@/lib/stripe-connect-cochran";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const v = await verifyCochranConnectOperatorRequest(
    request.headers.get("Authorization"),
    verifyIdToken
  );
  if (!v.ok) {
    if (v.log) {
      console.warn(cochranConnectJsonLog(v.log));
    }
    return NextResponse.json({ error: v.error }, { status: v.status });
  }

  const db = getAdminFirestore();
  const stripe = getStripeInstance();
  const snap = await db.collection("profiles").doc(v.uid).get();
  const d = snap.data() ?? {};
  const stripeConnectAccountId = d.stripe_connect_account_id as string | undefined;

  const cached = {
    stripe_connect_charges_enabled: d.stripe_connect_charges_enabled ?? null,
    stripe_connect_payouts_enabled: d.stripe_connect_payouts_enabled ?? null,
    stripe_connect_details_submitted: d.stripe_connect_details_submitted ?? null,
    stripe_connect_disabled_reason: d.stripe_connect_disabled_reason ?? null,
    stripe_connect_requirements_currently_due: d.stripe_connect_requirements_currently_due ?? [],
    stripe_connect_requirements_eventually_due: d.stripe_connect_requirements_eventually_due ?? [],
    stripe_connect_capabilities: d.stripe_connect_capabilities ?? null,
    stripe_connect_onboarding_complete: d.stripe_connect_onboarding_complete ?? false,
    stripe_connect_last_synced_at: d.stripe_connect_last_synced_at ?? null,
  };

  if (!stripeConnectAccountId || stripeConnectAccountId.trim() === "") {
    return NextResponse.json({
      stripe_connect_account_id: null,
      cached,
      stripe: null,
      stripe_connect_onboarding_complete: false,
    });
  }

  const accountId = stripeConnectAccountId.trim();
  try {
    const account = await stripe.accounts.retrieve(accountId);
    await mergeCochranConnectProfileFromStripeAccount(db, account);
    const refreshedFields = buildCochranConnectProfileFieldsFromAccount(account);
    const live = {
      stripe_connect_account_id: account.id,
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      requirements: {
        currently_due: account.requirements?.currently_due ?? [],
        eventually_due: account.requirements?.eventually_due ?? [],
        disabled_reason: account.requirements?.disabled_reason ?? null,
      },
      capabilities: pickCochranConnectNormalizedCapabilities(account),
      business_profile: {
        name: account.business_profile?.name ?? null,
        url: account.business_profile?.url ?? null,
        support_email: account.business_profile?.support_email ?? null,
      },
    };

    const onboardingComplete = deriveCochranStripeConnectOnboardingComplete(account);

    console.log(
      cochranConnectJsonLog({
        action: "cochran_connect_status_fetched",
        uid: v.uid,
        stripe_connect_account_id: account.id,
      })
    );

    return NextResponse.json({
      stripe_connect_account_id: account.id,
      cached: { ...cached, ...refreshedFields },
      stripe: live,
      stripe_connect_onboarding_complete: onboardingComplete,
    });
  } catch (err) {
    console.warn(
      cochranConnectJsonLog({
        action: "cochran_connect_status_stripe_failed",
        uid: v.uid,
        stripe_connect_account_id: accountId,
        detail: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json({
      stripe_connect_account_id: accountId,
      cached,
      stripe: null,
      stripe_connect_error:
        err instanceof Error ? err.message : "Failed to load Stripe Connect account",
      stripe_connect_onboarding_complete: cached.stripe_connect_onboarding_complete,
    });
  }
}
