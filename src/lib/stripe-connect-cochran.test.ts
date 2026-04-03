import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import {
  isCochranConnectOperatorEmail,
} from "@/lib/cochran-connect-operator";
import {
  applyBizziSubscriptionConnectConfigToSubscriptionData,
  buildBizziSubscriptionConnectConfig,
  buildCochranConnectProfileFieldsFromAccount,
  deriveCochranStripeConnectOnboardingComplete,
  evaluateCochranConnectDestinationReadiness,
  isWellFormedStripeConnectAccountId,
  resolveCochranConnectDestination,
  verifyCochranConnectOperatorRequest,
} from "@/lib/stripe-connect-cochran";

function baseExpressAccount(over: Partial<Stripe.Account> = {}): Stripe.Account {
  return {
    id: "acct_testExpress",
    object: "account",
    type: "express",
    details_submitted: true,
    charges_enabled: true,
    payouts_enabled: true,
    email: null,
    requirements: {
      alternatives: null,
      errors: null,
      current_deadline: null,
      currently_due: [],
      disabled_reason: null,
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
    capabilities: {
      card_payments: "active",
      transfers: "active",
    },
    ...over,
  } as Stripe.Account;
}

describe("isCochranConnectOperatorEmail", () => {
  it("accepts canonical email with different casing and whitespace", () => {
    expect(isCochranConnectOperatorEmail("info@cochranfilms.com")).toBe(true);
    expect(isCochranConnectOperatorEmail("  Info@CochranFilms.COM  ")).toBe(true);
  });
  it("rejects other emails and empty", () => {
    expect(isCochranConnectOperatorEmail("other@x.com")).toBe(false);
    expect(isCochranConnectOperatorEmail("")).toBe(false);
    expect(isCochranConnectOperatorEmail(undefined)).toBe(false);
  });
});

describe("verifyCochranConnectOperatorRequest", () => {
  it("returns 401 without token", async () => {
    const r = await verifyCochranConnectOperatorRequest(null, async () => {
      throw new Error("no");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });
  it("returns 403 for wrong email", async () => {
    const r = await verifyCochranConnectOperatorRequest("Bearer x", async () => ({
      uid: "u1",
      email: "wrong@x.com",
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
  it("returns uid for operator email", async () => {
    const r = await verifyCochranConnectOperatorRequest("Bearer x", async () => ({
      uid: "u-op",
      email: "info@cochranfilms.com",
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.uid).toBe("u-op");
  });
});

describe("evaluateCochranConnectDestinationReadiness", () => {
  it("passes for fully ready Express account", () => {
    const { ok, reasons } = evaluateCochranConnectDestinationReadiness(baseExpressAccount());
    expect(ok).toBe(true);
    expect(reasons).toEqual([]);
  });
  it("fails when details not submitted", () => {
    const { ok } = evaluateCochranConnectDestinationReadiness(
      baseExpressAccount({ details_submitted: false })
    );
    expect(ok).toBe(false);
  });
  it("fails when currently_due non-empty", () => {
    const { ok } = evaluateCochranConnectDestinationReadiness(
      baseExpressAccount({
        requirements: {
          alternatives: null,
          errors: null,
          current_deadline: null,
          currently_due: ["person.verification.document"],
          disabled_reason: null,
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      })
    );
    expect(ok).toBe(false);
  });
  it("fails when disabled_reason set", () => {
    const { ok } = evaluateCochranConnectDestinationReadiness(
      baseExpressAccount({
        requirements: {
          alternatives: null,
          errors: null,
          current_deadline: null,
          currently_due: [],
          disabled_reason: "rejected.fraud",
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      })
    );
    expect(ok).toBe(false);
  });
  it("fails when card_payments not active", () => {
    const { ok } = evaluateCochranConnectDestinationReadiness(
      baseExpressAccount({
        capabilities: { card_payments: "pending", transfers: "active" },
      })
    );
    expect(ok).toBe(false);
  });
  it("fails when transfers not active", () => {
    const { ok } = evaluateCochranConnectDestinationReadiness(
      baseExpressAccount({
        capabilities: { card_payments: "active", transfers: "inactive" },
      })
    );
    expect(ok).toBe(false);
  });
});

describe("buildBizziSubscriptionConnectConfig", () => {
  it("returns platform_only when resolution is platform_only", () => {
    const c = buildBizziSubscriptionConnectConfig(
      { planId: "solo" },
      { mode: "platform_only", reason: "x" }
    );
    expect(c).toEqual({ mode: "platform_only" });
  });
  it("returns destination_split when resolution is destination_ready", () => {
    const c = buildBizziSubscriptionConnectConfig(
      { planId: "solo" },
      {
        mode: "destination_ready",
        destination: "acct_abc",
        stripe_account: baseExpressAccount({ id: "acct_abc" }),
      }
    );
    expect(c).toEqual({
      mode: "destination_split",
      destination: "acct_abc",
      application_fee_percent: 60,
    });
  });
});

describe("applyBizziSubscriptionConnectConfigToSubscriptionData", () => {
  it("adds transfer_data and application_fee_percent for split", () => {
    const s = applyBizziSubscriptionConnectConfigToSubscriptionData(
      { planId: "solo" },
      {
        mode: "destination_split",
        destination: "acct_z",
        application_fee_percent: 60,
      }
    );
    expect(s.metadata?.planId).toBe("solo");
    expect(s.transfer_data?.destination).toBe("acct_z");
    expect(s.application_fee_percent).toBe(60);
  });
  it("omits split for platform_only", () => {
    const s = applyBizziSubscriptionConnectConfigToSubscriptionData(
      { planId: "solo" },
      { mode: "platform_only" }
    );
    expect(s.metadata?.planId).toBe("solo");
    expect(s.transfer_data).toBeUndefined();
    expect(s.application_fee_percent).toBeUndefined();
  });
});

describe("resolveCochranConnectDestination", () => {
  it("returns platform_only when operator user missing", async () => {
    const stripe = { accounts: { retrieve: vi.fn() } } as unknown as Stripe;
    const db = {} as Firestore;
    const r = await resolveCochranConnectDestination(stripe, db, async () => null);
    expect(r.mode).toBe("platform_only");
    if (r.mode === "platform_only") expect(r.reason).toBe("cochran_operator_user_not_found");
  });
  it("returns platform_only when stored id malformed", async () => {
    const stripe = { accounts: { retrieve: vi.fn() } } as unknown as Stripe;
    const db = {
      collection: () => ({
        doc: () => ({
          get: vi.fn(async () => ({
            data: () => ({ stripe_connect_account_id: "not_an_acct_id" }),
          })),
        }),
      }),
    } as unknown as Firestore;
    const r = await resolveCochranConnectDestination(stripe, db, async () => ({
      uid: "op",
    }));
    expect(r.mode).toBe("platform_only");
    if (r.mode === "platform_only")
      expect(r.reason).toBe("missing_or_invalid_stripe_connect_account_id");
  });
  it("returns platform_only when retrieve throws", async () => {
    const stripe = {
      accounts: {
        retrieve: vi.fn(async () => {
          throw new Error("no such account");
        }),
      },
    } as unknown as Stripe;
    const db = {
      collection: () => ({
        doc: () => ({
          get: vi.fn(async () => ({
            data: () => ({ stripe_connect_account_id: "acct_valid123" }),
          })),
        }),
      }),
    } as unknown as Firestore;
    const r = await resolveCochranConnectDestination(stripe, db, async () => ({
      uid: "op",
    }));
    expect(r.mode).toBe("platform_only");
    if (r.mode === "platform_only") expect(r.reason).toBe("stripe_accounts_retrieve_failed");
  });
  it("returns platform_only when account not ready for destination split", async () => {
    const notReady = baseExpressAccount({
      details_submitted: false,
    });
    const stripe = {
      accounts: {
        retrieve: vi.fn(async () => notReady),
      },
    } as unknown as Stripe;
    const db = {
      collection: () => ({
        doc: () => ({
          get: vi.fn(async () => ({
            data: () => ({ stripe_connect_account_id: "acct_ok" }),
          })),
        }),
      }),
    } as unknown as Firestore;
    const r = await resolveCochranConnectDestination(stripe, db, async () => ({
      uid: "op",
    }));
    expect(r.mode).toBe("platform_only");
    if (r.mode === "platform_only")
      expect(r.reason).toBe("cochran_connect_not_ready_for_destination_split");
  });
  it("returns destination_ready when account passes gates", async () => {
    const acct = baseExpressAccount({ id: "acct_ok" });
    const stripe = {
      accounts: {
        retrieve: vi.fn(async () => acct),
      },
    } as unknown as Stripe;
    const db = {
      collection: () => ({
        doc: () => ({
          get: vi.fn(async () => ({
            data: () => ({ stripe_connect_account_id: "acct_ok" }),
          })),
        }),
      }),
    } as unknown as Firestore;
    const r = await resolveCochranConnectDestination(stripe, db, async () => ({
      uid: "op",
    }));
    expect(r.mode).toBe("destination_ready");
    if (r.mode === "destination_ready") {
      expect(r.destination).toBe("acct_ok");
      expect(deriveCochranStripeConnectOnboardingComplete(r.stripe_account)).toBe(true);
    }
  });
});

describe("isWellFormedStripeConnectAccountId", () => {
  it("accepts acct_ ids", () => {
    expect(isWellFormedStripeConnectAccountId("acct_1Ab2Cd3Ef")).toBe(true);
  });
  it("rejects invalid", () => {
    expect(isWellFormedStripeConnectAccountId("acc_123")).toBe(false);
    expect(isWellFormedStripeConnectAccountId("")).toBe(false);
  });
});

describe("buildCochranConnectProfileFieldsFromAccount", () => {
  it("sets snake_case cache and derived onboarding flag", () => {
    const f = buildCochranConnectProfileFieldsFromAccount(baseExpressAccount());
    expect(f.stripe_connect_onboarding_complete).toBe(true);
    expect(f.stripe_connect_capabilities).toEqual({
      card_payments: "active",
      transfers: "active",
    });
    expect(f.stripe_connect_requirements_currently_due).toEqual([]);
  });
});
