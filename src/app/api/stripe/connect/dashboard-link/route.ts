import { getStripeInstance } from "@/lib/stripe";
import {
  cochranConnectJsonLog,
  deriveCochranStripeConnectOnboardingComplete,
  verifyCochranConnectOperatorRequest,
} from "@/lib/stripe-connect-cochran";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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
  const rawId = snap.data()?.stripe_connect_account_id as string | undefined;
  const accountId = typeof rawId === "string" ? rawId.trim() : "";

  if (!accountId) {
    return NextResponse.json(
      {
        error: "No Stripe Connect account linked. Complete onboarding first.",
        code: "CONNECT_NO_ACCOUNT",
      },
      { status: 400 }
    );
  }

  let account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch (err) {
    console.warn(
      cochranConnectJsonLog({
        action: "cochran_connect_dashboard_retrieve_failed",
        uid: v.uid,
        stripe_connect_account_id: accountId,
        detail: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json(
      {
        error: "Could not load your Connect account from Stripe.",
        code: "CONNECT_RETRIEVE_FAILED",
      },
      { status: 400 }
    );
  }

  if (!deriveCochranStripeConnectOnboardingComplete(account)) {
    console.warn(
      cochranConnectJsonLog({
        action: "cochran_connect_dashboard_blocked_not_ready",
        uid: v.uid,
        stripe_connect_account_id: accountId,
      })
    );
    return NextResponse.json(
      {
        error:
          "Connect onboarding is not complete yet. Finish requirements or resume onboarding.",
        code: "CONNECT_NOT_READY",
      },
      { status: 409 }
    );
  }

  try {
    const login = await stripe.accounts.createLoginLink(accountId);
    console.log(
      cochranConnectJsonLog({
        action: "cochran_connect_dashboard_link_created",
        uid: v.uid,
        stripe_connect_account_id: accountId,
      })
    );
    return NextResponse.json({ url: login.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      cochranConnectJsonLog({
        action: "cochran_connect_dashboard_link_failed",
        uid: v.uid,
        stripe_connect_account_id: accountId,
        detail: msg,
      })
    );
    return NextResponse.json(
      {
        error:
          "Stripe could not create an Express dashboard link yet. Try again after onboarding finishes.",
        code: "CONNECT_LOGIN_LINK_FAILED",
        detail: msg,
      },
      { status: 502 }
    );
  }
}
