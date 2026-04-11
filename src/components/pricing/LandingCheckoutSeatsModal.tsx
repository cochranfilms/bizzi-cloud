"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Minus, Plus } from "lucide-react";
import { plans, powerUpAddons, planAllowsPersonalTeamSeats, ANNUAL_SAVINGS_PERCENT } from "@/lib/pricing-data";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import type { PlanBuilderCheckoutPayload } from "@/components/pricing/BuildPlanConfigurator";
import {
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  TEAM_SEAT_MONTHLY_USD,
  MAX_EXTRA_PERSONAL_TEAM_SEATS,
  maxSelectableForTier,
  sumExtraTeamSeats,
  teamSeatMonthlySubtotal,
  teamSeatAnnualCentsPerSeat,
  teamSeatsAnnualUsdTotal,
  emptyTeamSeatCounts,
  type PersonalTeamSeatAccess,
  type TeamSeatCounts,
} from "@/lib/team-seat-pricing";

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type PriceRow = { label: string; value: string; detail?: string };

export default function LandingCheckoutSeatsModal({
  open,
  payload,
  loading,
  error,
  onClose,
  onFinishAndPay,
}: {
  open: boolean;
  payload: PlanBuilderCheckoutPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onFinishAndPay: (teamSeatCounts: TeamSeatCounts) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<TeamSeatCounts>(emptyTeamSeatCounts());

  useEffect(() => {
    if (!open) return;
    setDraft(emptyTeamSeatCounts());
  }, [open, payload?.planId, payload?.billing, payload?.addonIds.join(",")]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const adjustTier = useCallback((tier: PersonalTeamSeatAccess, delta: number) => {
    setDraft((prev) => {
      let nextVal = prev[tier] + delta;
      if (nextVal < 0) nextVal = 0;
      const tentative = { ...prev, [tier]: nextVal };
      const maxForTier = maxSelectableForTier(tentative, tier);
      if (tentative[tier] > maxForTier) tentative[tier] = maxForTier;
      return tentative;
    });
  }, []);

  const plan = payload ? plans.find((p) => p.id === payload.planId) : null;
  const allowsSeats = payload ? planAllowsPersonalTeamSeats(payload.planId) : false;
  const effectiveSeats = allowsSeats ? draft : emptyTeamSeatCounts();

  const addonMonthly = useMemo(() => {
    if (!payload) return 0;
    return payload.addonIds.reduce((sum, id) => {
      const a = powerUpAddons.find((x) => x.id === id);
      return sum + (a?.price ?? 0);
    }, 0);
  }, [payload]);

  const priceLines = useMemo(() => {
    if (!payload || !plan) return null;
    const billing = payload.billing;
    if (billing === "monthly") {
      const seatMo = teamSeatMonthlySubtotal(effectiveSeats);
      const total = plan.price + addonMonthly + seatMo;
      const rows: PriceRow[] = [
        { label: plan.name, value: `${formatUsd(plan.price)}/mo` },
        {
          label: productSettingsCopy.powerUps.label,
          value:
            payload.addonIds.length > 0 ? `+${formatUsd(addonMonthly)}/mo` : "—",
        },
      ];
      if (allowsSeats) {
        rows.push({
          label: `${productSettingsCopy.personalTeamSeats.shortLabel} (extra)`,
          value: seatMo > 0 ? `+${formatUsd(seatMo)}/mo` : "—",
          detail:
            seatMo > 0
              ? `${sumExtraTeamSeats(effectiveSeats)} extra seat${sumExtraTeamSeats(effectiveSeats) !== 1 ? "s" : ""}`
              : undefined,
        });
      }
      return {
        billing,
        rows,
        headline: `${formatUsd(total)}/mo`,
        headlineNote: "estimated recurring before taxes",
        footnote:
          allowsSeats && sumExtraTeamSeats(effectiveSeats) > 0
            ? "Seat prices follow your billing cycle. You can change seats later in Settings or Change Plan."
            : "You can add team seats later in Settings if you skip them now.",
      };
    }

    const annualBase = plan.annualPrice ?? plan.price * 12;
    const baseMo = annualBase / 12;
    const seatsAnnual = teamSeatsAnnualUsdTotal(effectiveSeats);
    const seatsMoEquiv = seatsAnnual / 12;
    const combinedMo = baseMo + addonMonthly + seatsMoEquiv;

    const rows: PriceRow[] = [
      { label: plan.name, value: `${formatUsd(annualBase)}/yr` },
      {
        label: productSettingsCopy.powerUps.label,
        value: payload.addonIds.length > 0 ? `+${formatUsd(addonMonthly)}/mo` : "—",
      },
    ];
    if (allowsSeats) {
      rows.push({
        label: `${productSettingsCopy.personalTeamSeats.shortLabel} (extra, annual)`,
        value: seatsAnnual > 0 ? `${formatUsd(seatsAnnual)}/yr` : "—",
        detail:
          seatsAnnual > 0
            ? `${sumExtraTeamSeats(effectiveSeats)} seat${sumExtraTeamSeats(effectiveSeats) !== 1 ? "s" : ""} · ~${formatUsd(seatsMoEquiv)}/mo avg.`
            : undefined,
      });
    }

    return {
      billing,
      rows,
      headline: `~${formatUsd(combinedMo)}/mo`,
      headlineNote: "typical monthly average before taxes",
      footnote:
        `Base plan and extra seats are billed annually (${ANNUAL_SAVINGS_PERCENT}% off vs monthly). Power Ups stay on monthly billing like your subscription invoice.`,
    };
  }, [payload, plan, addonMonthly, effectiveSeats, allowsSeats]);

  if (!open || !payload) return null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overscroll-contain p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/50"
        onClick={loading ? undefined : onClose}
      />
      <div
        className="relative z-10 my-auto max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-seats-title"
      >
        <h2 id="landing-seats-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
          Invite collaborators to your workspace.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Your plan includes 1 owner seat. Add seats for teammates who need their own login and access. These seats
          apply to personal workspaces, not Organizations.
        </p>

        {allowsSeats ? (
          <div className="mt-4 space-y-3 rounded-xl border border-cyan-200/80 bg-cyan-50/50 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/25">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-900 dark:text-cyan-200">
              Add extra seats now (optional)
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Up to {MAX_EXTRA_PERSONAL_TEAM_SEATS} extra seats total across tiers. Counts here update the Stripe
              checkout total shown below.
            </p>
            {(["none", "gallery", "editor", "fullframe"] as const).map((tier) => {
              const count = draft[tier];
              const max = maxSelectableForTier(draft, tier);
              const atMax = count >= max;
              return (
                <div
                  key={tier}
                  className="flex flex-col gap-2 border-b border-cyan-200/50 pb-3 last:border-0 last:pb-0 dark:border-cyan-900/35 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                      {PERSONAL_TEAM_SEAT_ACCESS_LABELS[tier]}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {payload.billing === "annual"
                        ? `${formatUsd(teamSeatAnnualCentsPerSeat(tier) / 100)}/yr per seat (${ANNUAL_SAVINGS_PERCENT}% off yearly)`
                        : `+${formatUsd(TEAM_SEAT_MONTHLY_USD[tier])}/mo per seat`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease ${tier} seats`}
                      onClick={() => adjustTier(tier, -1)}
                      disabled={count <= 0 || loading}
                      className="rounded-lg border border-neutral-200 bg-white p-2 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
                      {count}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${tier} seats`}
                      onClick={() => adjustTier(tier, 1)}
                      disabled={atMax || loading}
                      className="rounded-lg border border-neutral-200 bg-white p-2 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
            <strong className="text-neutral-800 dark:text-neutral-200">Bizzi Creator</strong> doesn&apos;t include
            extra team seats. You can upgrade your plan later in Settings to add a personal team workspace.
          </p>
        )}

        {priceLines ? (
          <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Checkout total (preview)
            </p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-800 dark:text-neutral-200">
              {priceLines.rows.map((row) => (
                <li key={row.label} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {row.label}
                    {row.detail ? (
                      <span className="mt-0.5 block text-xs text-neutral-500">{row.detail}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-neutral-900 dark:text-white">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-600">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {priceLines.billing === "monthly" ? "Estimated first invoice total" : "Typical monthly average"}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
                {priceLines.headline}
                <span className="ml-1.5 text-base font-semibold text-neutral-500 dark:text-neutral-400">
                  {priceLines.headlineNote}
                </span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                {priceLines.footnote} Final charge is set by Stripe at checkout.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Back
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onFinishAndPay(allowsSeats ? draft : emptyTeamSeatCounts())}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Finish &amp; Pay
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
