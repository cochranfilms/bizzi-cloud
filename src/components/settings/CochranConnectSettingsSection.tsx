"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";

const POLL_MS = 2800;
const POLL_MAX_TICKS = 22;

type ConnectStatusResponse = {
  stripe_connect_account_id: string | null;
  stripe_connect_onboarding_complete: boolean;
  stripe_connect_error?: string;
  cached?: Record<string, unknown>;
  stripe?: {
    details_submitted: boolean;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements: {
      currently_due: string[];
      eventually_due: string[];
      disabled_reason: string | null;
    };
    capabilities: { card_payments: string; transfers: string };
    business_profile: {
      name: string | null;
      url: string | null;
      support_email: string | null;
    };
  } | null;
};

function maskConnectAccountId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 10)}…${id.slice(-4)}`;
}

export default function CochranConnectSettingsSection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ConnectStatusResponse | null>(null);
  const onboardingCompleteRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/connect/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as ConnectStatusResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to load Connect status");
        setData(null);
        return;
      }
      setError(null);
      setData(json);
      onboardingCompleteRef.current = !!json.stripe_connect_onboarding_complete;
    } catch {
      setError("Failed to load Connect status");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    onboardingCompleteRef.current = false;
    setLoading(true);
    void load();

    let ticks = 0;
    const id = setInterval(() => {
      if (onboardingCompleteRef.current || ticks >= POLL_MAX_TICKS) {
        clearInterval(id);
        return;
      }
      ticks += 1;
      void load();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [load]);

  const startOnboarding = async () => {
    if (!user) return;
    setActionLoading("onboarding");
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/connect/onboarding", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not start onboarding");
        setActionLoading(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Could not start onboarding");
    } finally {
      setActionLoading(null);
    }
  };

  const openDashboard = async () => {
    if (!user) return;
    setActionLoading("dashboard");
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/connect/dashboard-link", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { url?: string; error?: string; code?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not open Stripe dashboard");
        setActionLoading(null);
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not open Stripe dashboard");
    } finally {
      setActionLoading(null);
    }
  };

  const stripe = data?.stripe;
  const complete = !!data?.stripe_connect_onboarding_complete;
  const accountId = data?.stripe_connect_account_id ?? null;
  const needsResume =
    !!accountId && !complete && !data?.stripe_connect_error;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <SettingsSectionScope label="Cochran Films Stripe Connect — revenue share (operator only)" />
      <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Link2 className="h-5 w-5 text-bizzi-blue" />
        Connect
      </h2>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading status…
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              {error}
            </div>
          )}

          {data?.stripe_connect_error && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Stripe: {data.stripe_connect_error}
            </p>
          )}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500 dark:text-neutral-400">Connected account</dt>
              <dd className="font-mono text-neutral-900 dark:text-white">
                {maskConnectAccountId(accountId)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500 dark:text-neutral-400">Onboarding complete</dt>
              <dd className="text-neutral-900 dark:text-white">{complete ? "Yes" : "No"}</dd>
            </div>
            {stripe && (
              <>
                <div>
                  <dt className="text-neutral-500 dark:text-neutral-400">Details submitted</dt>
                  <dd className="text-neutral-900 dark:text-white">
                    {stripe.details_submitted ? "Yes" : "No"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500 dark:text-neutral-400">Charges enabled</dt>
                  <dd className="text-neutral-900 dark:text-white">
                    {stripe.charges_enabled ? "Yes" : "No"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500 dark:text-neutral-400">Payouts enabled</dt>
                  <dd className="text-neutral-900 dark:text-white">
                    {stripe.payouts_enabled ? "Yes" : "No"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500 dark:text-neutral-400">Capabilities</dt>
                  <dd className="font-mono text-xs text-neutral-900 dark:text-white">
                    card_payments: {stripe.capabilities.card_payments}
                    <br />
                    transfers: {stripe.capabilities.transfers}
                  </dd>
                </div>
                {stripe.business_profile?.name && (
                  <div className="sm:col-span-2">
                    <dt className="text-neutral-500 dark:text-neutral-400">Business</dt>
                    <dd className="text-neutral-900 dark:text-white">
                      {stripe.business_profile.name}
                      {stripe.business_profile.url ? ` · ${stripe.business_profile.url}` : ""}
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>

          {stripe &&
            (stripe.requirements.currently_due.length > 0 ||
              stripe.requirements.eventually_due.length > 0 ||
              stripe.requirements.disabled_reason) && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-600 dark:bg-neutral-800/50">
                {stripe.requirements.disabled_reason && (
                  <p className="mb-2 font-medium text-neutral-900 dark:text-white">
                    Disabled: {stripe.requirements.disabled_reason}
                  </p>
                )}
                {stripe.requirements.currently_due.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-neutral-600 dark:text-neutral-400">Currently due</p>
                    <ul className="list-inside list-disc text-neutral-800 dark:text-neutral-200">
                      {stripe.requirements.currently_due.map((f) => (
                        <li key={f} className="break-all">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {stripe.requirements.eventually_due.length > 0 && (
                  <div>
                    <p className="mb-1 text-neutral-600 dark:text-neutral-400">Eventually due</p>
                    <ul className="list-inside list-disc text-neutral-800 dark:text-neutral-200">
                      {stripe.requirements.eventually_due.map((f) => (
                        <li key={f} className="break-all">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          <div className="flex flex-wrap gap-3">
            {!accountId && (
              <button
                type="button"
                onClick={() => void startOnboarding()}
                disabled={!!actionLoading}
                className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
              >
                {actionLoading === "onboarding" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting…
                  </span>
                ) : (
                  "Start onboarding"
                )}
              </button>
            )}
            {needsResume && (
              <button
                type="button"
                onClick={() => void startOnboarding()}
                disabled={!!actionLoading}
                className="rounded-lg border border-bizzi-blue bg-white px-4 py-2 text-sm font-medium text-bizzi-blue hover:bg-neutral-50 dark:border-bizzi-cyan dark:bg-neutral-900 dark:text-bizzi-cyan dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                {actionLoading === "onboarding" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Opening…
                  </span>
                ) : (
                  "Resume onboarding"
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => void openDashboard()}
              disabled={!!actionLoading || !complete}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              title={
                complete
                  ? "Open Stripe Express dashboard"
                  : "Complete onboarding before opening the dashboard"
              }
            >
              {actionLoading === "dashboard" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Stripe Express dashboard
            </button>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            After returning from Stripe, status refreshes automatically for a short period while
            your profile syncs.
          </p>
        </div>
      )}
    </section>
  );
}
