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
  addOnsNote: "Gallery Suite, Editor & Full Frame add-ons available when you upgrade",
  cta: "Get Started Free",
};

const plans = [
  {
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
    addOnsNote: "Gallery Suite, Editor, Full Frame + Extra storage up to +5 TB",
    cta: "Choose Indie Filmmaker",
    accentColor: BIZZI_BYTE_COLORS.habanero,
  },
  {
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
    addOnsNote: "Gallery Suite, Editor, Full Frame + Extra storage up to +10 TB",
    cta: "Choose Video Pro",
    accentColor: BIZZI_BYTE_COLORS.frost,
  },
  {
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
    addOnsNote: "Gallery Suite, Editor, Full Frame + Extra storage up to +20 TB",
    cta: "Choose Production House",
    accentColor: BIZZI_BYTE_COLORS.onyx,
  },
];

const powerUpAddons = [
  {
    name: "Bizzi Gallery Suite",
    tagline: "Gallery + Invoicing",
    price: 12,
    description:
      "The complete business toolkit for photographers — from client delivery to getting paid.",
    features: [
      "Unlimited branded client galleries",
      "Client proofing — favorites, approvals & downloads",
      "Custom gallery domain & branding",
      "Invoice & contract templates",
      "Stripe deposit & payment collection",
      "Revenue dashboard & payment reminders",
      "3 custom Lightroom presets included",
    ],
    accentColor: "#ECA000",
  },
  {
    name: "Bizzi Editor",
    tagline: "NLE Cloud Drive + LUTs",
    price: 15,
    description:
      "Mount your cloud as a local NLE drive. Edit RAW natively with Rec.709 LUTs — no full transfer needed.",
    features: [
      "Mount in Premiere Pro, DaVinci Resolve & Final Cut Pro",
      "Stream R3D, BRAW, ProRes RAW & ARRIRAW natively",
      "Smart local cache for frequently accessed clips",
      "3 Rec.709 LUT packs, camera-matched",
      "S-Log3 & LogC3 input transforms",
      "Upload & host your own custom LUT library",
    ],
    accentColor: "#A47BFF",
  },
  {
    name: "Bizzi Full Frame",
    tagline: "Gallery Suite + Editor bundled",
    price: 22,
    description:
      "The complete creative stack for photographers and filmmakers who do it all.",
    bundleNote: "Save $5/mo vs buying separately",
    features: [
      "Everything in Bizzi Gallery Suite",
      "Unlimited galleries, proofing & invoicing",
      "3 custom Lightroom presets",
      "Everything in Bizzi Editor",
      "NLE cloud drive — Premiere, Resolve, Final Cut",
      "3 Rec.709 LUT packs + S-Log3 & LogC3 transforms",
    ],
    accentColor: "#1EC8A8",
  },
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="py-20 md:py-28 px-6 bg-neutral-50/50"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-900 mb-4">
            Storage that scales with your craft
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Pick your storage. Add what you need. AES-256 encryption on every
            plan, always.
          </p>
        </div>

        {/* Free Tier */}
        <div className="mb-12">
          <div
            className="rounded-2xl border-2 p-6 md:p-8 shadow-lg bg-white"
            style={{
              borderColor: freeTier.accentColor + "40",
              background: `linear-gradient(to bottom right, ${freeTier.accentColor}08, white)`,
              boxShadow: `0 10px 15px -3px ${freeTier.accentColor}15`,
            }}
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="flex-1">
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3"
                  style={{
                    backgroundColor: freeTier.accentColor + "20",
                    color: freeTier.accentColor,
                  }}
                >
                  {freeTier.tagline}
                </span>
                <h3 className="text-2xl font-semibold text-neutral-900">
                  {freeTier.name}
                </h3>
                <p className="text-neutral-600 mt-1">{freeTier.description}</p>
                <p className="text-3xl font-bold text-neutral-900 mt-4">
                  $0
                  <span className="text-base font-normal text-neutral-500">
                    /mo
                  </span>
                </p>
                <p className="text-sm text-neutral-500 mt-0.5">
                  {freeTier.subtext}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
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
                  className="mt-6 w-full md:w-auto px-8 py-3 rounded-xl font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: freeTier.accentColor }}
                >
                  {freeTier.cta}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Base Plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {plans.map((plan) => {
            const accent = plan.accentColor;
            return (
              <div
                key={plan.name}
                className="relative rounded-2xl border-2 bg-white p-6 flex flex-col transition-all duration-200 hover:shadow-lg"
                style={{
                  borderColor: plan.popular ? accent : accent + "50",
                  boxShadow: plan.popular
                    ? `0 10px 15px -3px ${accent}25, 0 0 0 2px ${accent}30`
                    : undefined,
                }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {plan.tagline}
                    </span>
                  </div>
                )}
                {!plan.popular && (
                  <span
                    className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mb-2 w-fit"
                    style={{ backgroundColor: accent + "15", color: accent }}
                  >
                    {plan.tagline}
                  </span>
                )}
                <h3 className="text-xl font-semibold text-neutral-900">
                  {plan.name}
                </h3>
                <div className="mt-4">
                  <p className="text-3xl font-bold text-neutral-900">
                    ${plan.price}
                    <span className="text-base font-normal text-neutral-500">
                      /mo
                    </span>
                  </p>
                  <p className="text-sm text-neutral-500 mt-0.5">
                    or ${plan.annualPrice}/yr — save 25%
                  </p>
                </div>
                <div className="mt-3 flex gap-2 items-baseline">
                  <span className="text-sm font-medium text-neutral-500">
                    Storage
                  </span>
                  <span className="text-lg font-semibold text-neutral-900">
                    {plan.storage}
                  </span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-neutral-700 flex-grow">
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
                <p className="mt-2 text-xs text-neutral-500">
                  {plan.addOnsNote}
                </p>
                <button
                  type="button"
                  className="mt-6 w-full py-3 px-4 rounded-xl font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: accent }}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* Power Up Add-ons */}
        <div className="mb-16">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-neutral-900">
              Power up any plan
            </h3>
            <p className="text-sm text-neutral-500 mt-0.5">
              Add only what your workflow needs. Available on every paid plan.
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Stack freely. Cancel anytime. Add-ons billed monthly.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {powerUpAddons.map((addon) => (
              <div
                key={addon.name}
                className="rounded-2xl border border-neutral-200 bg-white overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                <div
                  className="h-1 w-full"
                  style={{ backgroundColor: addon.accentColor }}
                />
                <div className="p-6 flex flex-col flex-grow">
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: addon.accentColor }}
                >
                  {addon.tagline}
                </span>
                <h4
                  className="text-lg font-bold text-neutral-900 mt-1"
                  style={{ color: addon.accentColor }}
                >
                  {addon.name}
                </h4>
                <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                  {addon.description}
                </p>
                {addon.bundleNote && (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold mt-2 px-2.5 py-1 rounded-full w-fit"
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
                <ul className="mt-4 space-y-1.5 text-sm text-neutral-700 flex-grow">
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
                <p className="mt-4 text-xs text-neutral-500 border-t border-neutral-100 pt-3">
                  Available on <strong>all paid plans</strong>
                </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise Plan */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 md:p-8 mb-6 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex-1">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                <span className="h-1.5 w-1.5 rounded-sm bg-neutral-400 dark:bg-neutral-500" />
                For large teams
              </p>
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
                Enterprise
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Custom storage, unlimited seats, dedicated infrastructure and
                SLA-backed uptime. All add-ons included. Built for agencies,
                post-houses and broadcast studios.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col justify-center p-4 rounded-xl bg-neutral-50 border border-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    16 TB+
                  </span>
                  <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Custom Storage
                  </span>
                </div>
                <div className="flex flex-col justify-center p-4 rounded-xl bg-neutral-50 border border-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    Unlimited
                  </span>
                  <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Team Seats
                  </span>
                </div>
                <div className="flex flex-col justify-center p-4 rounded-xl bg-neutral-50 border border-neutral-100 dark:bg-neutral-800 dark:border-neutral-700">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    99.99%
                  </span>
                  <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Uptime SLA
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 py-3 px-6 rounded-xl font-medium bg-neutral-200 text-neutral-900 hover:bg-neutral-300 transition-colors dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-sm text-neutral-500 mt-8">
          AES-256 encryption at rest and in transit on every plan, always · 30-day
          money-back guarantee · Cancel anytime
        </p>
        <p className="text-center text-xs text-neutral-400 mt-2">
          Annual discount applies to base plan price only. Add-ons billed monthly.
        </p>
      </div>
    </section>
  );
}
