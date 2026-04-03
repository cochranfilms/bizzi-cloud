import { getStripeInstance } from "@/lib/stripe";
import {
  cochranConnectJsonLog,
  mergeCochranConnectProfileFromStripeAccount,
  verifyCochranConnectOperatorRequest,
} from "@/lib/stripe-connect-cochran";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

function connectReturnBaseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    request.headers.get("origin") ??
    "http://localhost:3000"
  );
}

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
  const profileRef = db.collection("profiles").doc(v.uid);

  let profileSnap = await profileRef.get();
  let stripeConnectAccountId = profileSnap.data()?.stripe_connect_account_id as
    | string
    | undefined;

  if (!profileSnap.exists) {
    await profileRef.set({ userId: v.uid }, { merge: true });
    profileSnap = await profileRef.get();
  }

  if (!stripeConnectAccountId || stripeConnectAccountId.trim() === "") {
    const acct = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    stripeConnectAccountId = acct.id;
    await profileRef.set(
      { userId: v.uid, stripe_connect_account_id: acct.id },
      { merge: true }
    );
    await mergeCochranConnectProfileFromStripeAccount(db, acct);
    console.log(
      cochranConnectJsonLog({
        action: "cochran_connect_express_created",
        uid: v.uid,
        stripe_connect_account_id: acct.id,
      })
    );
  } else {
    try {
      const acct = await stripe.accounts.retrieve(stripeConnectAccountId.trim());
      await mergeCochranConnectProfileFromStripeAccount(db, acct);
    } catch (err) {
      console.warn(
        cochranConnectJsonLog({
          action: "cochran_connect_pre_onboarding_retrieve_failed",
          uid: v.uid,
          stripe_connect_account_id: stripeConnectAccountId,
          detail: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }

  const base = connectReturnBaseUrl(request);
  const returnUrl = `${base}/dashboard/settings#connect`;
  const refreshUrl = returnUrl;

  const accountForLink =
    typeof stripeConnectAccountId === "string" ? stripeConnectAccountId.trim() : "";
  if (!accountForLink) {
    return NextResponse.json(
      { error: "Could not determine Connect account for onboarding link." },
      { status: 500 }
    );
  }

  const link = await stripe.accountLinks.create({
    account: accountForLink,
    type: "account_onboarding",
    refresh_url: refreshUrl,
    return_url: returnUrl,
  });

  console.log(
    cochranConnectJsonLog({
      action: "cochran_connect_onboarding_link_created",
      uid: v.uid,
      stripe_connect_account_id: accountForLink,
    })
  );

  return NextResponse.json({ url: link.url });
}
