/**
 * Client helper: Stripe Customer Portal for personal or organization billing.
 */

export type StripePortalCustomerContext = "auto" | "profile" | "organization";

export type StripePortalReturnPath =
  | "dashboard_settings"
  | "enterprise_settings"
  | "change_plan";

export type CreateStripePortalOptions = {
  customer_context?: StripePortalCustomerContext;
  return_path?: StripePortalReturnPath;
};

export async function createStripePortalSession(
  idToken: string,
  options?: CreateStripePortalOptions
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const res = await fetch(`${base}/api/stripe/portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(options ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (res.ok && data.url) return { ok: true, url: data.url };
  return { ok: false, error: data.error ?? "Failed to open billing portal" };
}
