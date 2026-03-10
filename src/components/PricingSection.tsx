"use client";

import { useState } from "react";

// Bizzi Byte accent colors for pricing tiers
const BIZZI_BYTE_COLORS = {
  matcha: "#84cc16",
  habanero: "#dc2626",
  frost: "#38bdf8",
  onyx: "#171717",
} as const;

const freeTier = {
  name: "Starter Free",
  tagline: "Free Forever",
  storage: "2 GB",
  price: 0,
  accentColor: BIZZI_BYTE_COLORS.matcha,
  subtext: "Free forever, always",
  description: "Your first step into the cloud — no credit card, no expiry.",
  features: [
    "2 GB AES-256 encrypted storage",
    "Upload & access from any device",
    "Download your files anytime",
    "Share links for files & folders",
    "Basic folder organization",
  ],
  limitations: [
    "500 MB max file size",
    "No extra storage add-on",
  ],
  addOnsNote:
    "Gallery Suite, Editor & Full Frame add-ons available when you upgrade",
  cta: "Get Started Free",
};

const plans = [
  {
    id: "solo",
    name: "Solo Creator",
    tagline: "Essential",
    storage: "1 TB",
    price: 12,
    annualPrice: 108,
    features: [
      "1 TB AES-256 encrypted storage",
      "Files up to 20 GB each",
      "Download & share links",
      "Unlimited bandwidth",
      "Password-protected links",
      "30-day version history",
    ],
    limitations: ["No extra storage add-on"],
    addOnsNote: "Gallery Suite, Editor & Full Frame available",
    cta: "Choose Solo Creator",
    accentColor: BIZZI_BYTE_COLORS.matcha,
  },
  {
    id: "indie",
    name: "Indie Filmmaker",
    tagline: "Most Popular",
    storage: "2 TB",
    price: 20,
    annualPrice: 180,
    popular: true,
    features: [
      "2 TB AES-256 encrypted storage",
      "Files up to 50 GB — RAW ready",
      "Download & share links",
      "Unlimited bandwidth",
      "60-day version history",
      "Up to 2 collaborators",
      "Review & approval workflow",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame + Extra storage up to +5 TB",
    cta: "Choose Indie Filmmaker",
    accentColor: BIZZI_BYTE_COLORS.habanero,
  },
  {
    id: "video",
    name: "Video Pro",
    tagline: "Professional",
    storage: "5 TB",
    price: 35,
    annualPrice: 315,
    features: [
      "5 TB AES-256 encrypted storage",
      "Files up to 200 GB each",
      "Download & share links",
      "Accelerated upload speeds",
      "90-day version history",
      "Up to 5 collaborators",
      "Branded client delivery pages",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame + Extra storage up to +10 TB",
    cta: "Choose Video Pro",
    accentColor: BIZZI_BYTE_COLORS.frost,
  },
  {
    id: "production",
    name: "Production House",
    tagline: "Agency & Production",
    storage: "10 TB",
    price: 70,
    annualPrice: 630,
    features: [
      "10 TB AES-256 encrypted storage",
      "Unlimited file size uploads",
      "Download & share links",
      "Priority transfer speeds",
      "Unlimited version history",
      "Up to 10 team seats",
      "SSO & advanced permissions",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame + Extra storage up to +20 TB",
    cta: "Choose Production House",
    accentColor: BIZZI_BYTE_COLORS.onyx,
  },
];

const powerUpAddons = [
  {
    id: "gallery",
    name: "Bizzi Gallery Suite",
    tagline: "Gallery + Invoicing",
    price: 5,
    description:
      "Photo galleries with invoicing, proofing & client delivery. 3 Lightroom presets included — toggle on/off like Rec.709.",
    features: [
      "Unlimited branded client galleries",
      "Client proofing — favorites, approvals & downloads",
      "Custom gallery domain & branding",
      "Invoice & contract templates",
      "Stripe deposit & payment collection",
      "Revenue dashboard & payment reminders",
      "3 custom Lightroom presets (toggle on/off)",
    ],
    accentColor: "#ECA000",
  },
  {
    id: "editor",
    name: "Bizzi Editor",
    tagline: "NLE Cloud Drive + Rec.709",
    price: 8,
    description:
      "Mount your cloud as a virtual SSD. NLE editing with Rec.709 LUTs — edit RAW natively in Premiere, Resolve & Final Cut.",
    features: [
      "Mount as virtual drive in Premiere, Resolve & Final Cut",
      "Rec.709 LUTs — toggle on/off per clip",
      "Stream R3D, BRAW, ProRes RAW & ARRIRAW natively",
      "Smart local cache for frequently accessed clips",
      "3 Rec.709 LUT packs, camera-matched",
      "S-Log3 & LogC3 input transforms",
    ],
    accentColor: "#A47BFF",
  },
  {
    id: "fullframe",
    name: "Bizzi Full Frame",
    tagline: "Gallery Suite + Editor bundled",
    price: 10,
    description:
      "The complete creative stack — galleries, invoicing, proofing, and NLE editing with Rec.709. Both Power Ups in one.",
    bundleNote: "Save $3/mo vs buying separately",
    features: [
      "Everything in Bizzi Gallery Suite",
      "Unlimited galleries, proofing & invoicing",
      "3 custom Lightroom presets (toggle on/off)",
      "Everything in Bizzi Editor",
      "NLE cloud drive — virtual SSD in your NLE",
      "3 Rec.709 LUT packs (toggle on/off)",
    ],
    accentColor: "#1EC8A8",
  },
];

function PlanCard({
  plan,
  minBadgeHeight,
}: {
  plan: (typeof plans)[0];
  minBadgeHeight: string;
}) {
  const accent = plan.accentColor;
  return (
    <div
      className="relative flex h-full flex-col rounded-2xl border-2 bg-white p-6 transition-all duration-200 hover:shadow-lg"
      style={{
        borderColor: plan.popular ? accent : accent + "50",
        boxShadow: plan.popular
          ? `0 10px 15px -3px ${accent}25, 0 0 0 2px ${accent}30`
          : undefined,
      }}
    >
      {/* Badge row - fixed height for alignment */}
      <div
        className="mb-3 flex items-center"
        style={{ minHeight: minBadgeHeight }}
      >
        {plan.popular ? (
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: accent }}
          >
            {plan.tagline}
          </span>
        ) : (
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: accent + "15", color: accent }}
          >
            {plan.tagline}
          </span>
        )}
      </div>
      <h3 className="text-xl font-semibold text-neutral-900">{plan.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-neutral-900">
          ${plan.price}
        </span>
        <span className="text-base font-normal text-neutral-500">/mo</span>
      </div>
      <p className="mt-0.5 text-sm text-neutral-500">
        or ${plan.annualPrice}/yr — save 25%
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-sm font-medium text-neutral-500">Storage</span>
        <span className="text-lg font-semibold text-neutral-900">
          {plan.storage}
        </span>
      </div>
      <ul className="mt-4 flex-grow space-y-1.5 text-sm text-neutral-700">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="shrink-0" style={{ color: accent }}>
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>
      {plan.limitations && plan.limitations.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
          {plan.limitations.map((l) => (
            <li key={l}>— {l}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-neutral-500">{plan.addOnsNote}</p>
      <button
        type="button"
        className="mt-6 w-full py-3 px-4 rounded-xl font-medium text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: accent }}
      >
        {plan.cta}
      </button>
    </div>
  );
}

function AddonCard({
  addon,
  minBadgeHeight,
}: {
  addon: (typeof powerUpAddons)[0];
  minBadgeHeight: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-shadow hover:shadow-md">
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: addon.accentColor }}
      />
      <div className="flex flex-grow flex-col p-6">
        <div
          className="flex items-center"
          style={{ minHeight: minBadgeHeight }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: addon.accentColor }}
          >
            {addon.tagline}
          </span>
        </div>
        <h4
          className="text-lg font-bold text-neutral-900"
          style={{ color: addon.accentColor }}
        >
          {addon.name}
        </h4>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {addon.description}
        </p>
        {addon.bundleNote && (
          <span
            className="mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              backgroundColor: addon.accentColor + "15",
              color: addon.accentColor,
            }}
          >
            ✦ {addon.bundleNote}
          </span>
        )}
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-sm text-neutral-500">+</span>
          <span
            className="text-2xl font-bold"
            style={{ color: addon.accentColor }}
          >
            ${addon.price}
          </span>
          <span className="text-sm text-neutral-500">/mo</span>
        </div>
        <ul className="mt-4 flex-grow space-y-1.5 text-sm text-neutral-700">
          {addon.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span
                className="shrink-0"
                style={{ color: addon.accentColor }}
              >
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          Available on <strong>all paid plans</strong>
        </p>
      </div>
    </div>
  );
}

export default function PricingSection() {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const selectedAddon = powerUpAddons.find((a) => a.id === selectedAddonId);
  const total =
    selectedPlan && selectedAddon
      ? selectedPlan.price + selectedAddon.price
      : 0;

  const BADGE_MIN_H = "28px";

  return (
    <section
      id="pricing"
      className="bg-neutral-50/50 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
            Storage that scales with your craft
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-neutral-600">
            Pick your storage. Add what you need. AES-256 encryption on every
            plan, always.
          </p>
        </div>

        {/* Free Tier */}
        <div className="mb-12">
          <div
            className="rounded-2xl border-2 bg-white p-6 shadow-lg md:p-8"
            style={{
              borderColor: freeTier.accentColor + "40",
              background: `linear-gradient(to bottom right, ${freeTier.accentColor}08, white)`,
              boxShadow: `0 10px 15px -3px ${freeTier.accentColor}15`,
            }}
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <div className="mb-3" style={{ minHeight: BADGE_MIN_H }}>
                  <span
                    className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: freeTier.accentColor + "20",
                      color: freeTier.accentColor,
                    }}
                  >
                    {freeTier.tagline}
                  </span>
                </div>
                <h3 className="text-2xl font-semibold text-neutral-900">
                  {freeTier.name}
                </h3>
                <p className="mt-1 text-neutral-600">{freeTier.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-neutral-900">$0</span>
                  <span className="text-base font-normal text-neutral-500">
                    /mo
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {freeTier.subtext}
                </p>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-neutral-500">
                    Cloud Storage
                  </span>
                  <span className="text-lg font-semibold text-neutral-900">
                    {freeTier.storage}
                  </span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-neutral-700">
                  {freeTier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span
                        className="shrink-0"
                        style={{ color: freeTier.accentColor }}
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <ul className="mt-3 space-y-1 text-sm text-neutral-500">
                  {freeTier.limitations.map((l) => (
                    <li key={l}>— {l}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-neutral-500">
                  {freeTier.addOnsNote}
                </p>
                <button
                  type="button"
                  className="mt-6 w-full rounded-xl px-8 py-3 font-medium text-white transition-colors hover:opacity-90 md:w-auto"
                  style={{ backgroundColor: freeTier.accentColor }}
                >
                  {freeTier.cta}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Base Plans */}
        <div className="mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              minBadgeHeight={BADGE_MIN_H}
            />
          ))}
        </div>

        {/* Power Up Add-ons */}
        <div className="mb-16">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-neutral-900">
              Power up any plan
            </h3>
            <p className="mt-0.5 text-sm text-neutral-500">
              Add only what your workflow needs. Available on every paid plan
              (except free).
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Stack freely. Cancel anytime. Add-ons billed monthly.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {powerUpAddons.map((addon) => (
              <AddonCard
                key={addon.id}
                addon={addon}
                minBadgeHeight={BADGE_MIN_H}
              />
            ))}
          </div>
        </div>

        {/* Build your plan calculator */}
        <div className="mb-16 rounded-2xl border border-neutral-200 bg-white p-6 md:p-8">
          <h3 className="text-lg font-bold text-neutral-900">
            Build your plan
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Select a base plan and Power Up to see your total.
          </p>
          <div className="mt-6 flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                Base plan
              </label>
              <select
                value={selectedPlanId ?? ""}
                onChange={(e) =>
                  setSelectedPlanId(e.target.value || null)
                }
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-bizzi-blue"
              >
                <option value="">Choose plan…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ${p.price}/mo ({p.storage})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                Power Up add-on
              </label>
              <select
                value={selectedAddonId ?? ""}
                onChange={(e) =>
                  setSelectedAddonId(e.target.value || null)
                }
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-bizzi-blue"
              >
                <option value="">No add-on</option>
                {powerUpAddons.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — +${a.price}/mo
                  </option>
                ))}
              </select>
            </div>
            {selectedPlan && selectedAddon && (
              <div className="ml-auto flex items-baseline gap-2 rounded-lg bg-neutral-50 px-4 py-3">
                <span className="text-sm text-neutral-500">
                  ${selectedPlan.price} + ${selectedAddon.price}
                </span>
                <span className="text-xl font-bold text-neutral-900">
                  = ${total}/mo
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Enterprise Plan */}
        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                <span className="h-1.5 w-1.5 rounded-sm bg-neutral-400 dark:bg-neutral-500" />
                For large teams
              </p>
              <h3 className="mb-3 text-2xl font-bold text-neutral-900 dark:text-white">
                Enterprise
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Custom storage, unlimited seats, dedicated infrastructure and
                SLA-backed uptime. All add-ons included. Built for agencies,
                post-houses and broadcast studios.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col justify-center rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    16 TB+
                  </span>
                  <span className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Custom Storage
                  </span>
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    Unlimited
                  </span>
                  <span className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Team Seats
                  </span>
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    99.99%
                  </span>
                  <span className="mt-0.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Uptime SLA
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-xl bg-neutral-200 px-6 py-3 font-medium text-neutral-900 transition-colors hover:bg-neutral-300 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-8 text-center text-sm text-neutral-500">
          AES-256 encryption at rest and in transit on every plan, always ·
          30-day money-back guarantee · Cancel anytime
        </p>
        <p className="mt-2 text-center text-xs text-neutral-400">
          Annual discount applies to base plan price only. Add-ons billed
          monthly.
        </p>
      </div>
    </section>
  );
}
