// Bizzi Byte accent colors for pricing tiers
const BIZZI_BYTE_COLORS = {
  matcha: "#84cc16",
  habanero: "#dc2626",
  onyx: "#171717",
  bubble: "#ec4899",
  frost: "#38bdf8",
  citrus: "#f97316",
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
    "2 GB secure cloud storage",
    "File upload & download from any device",
    "Shareable file links (view-only)",
    "Web-based media preview (photos, video, audio)",
    "Basic folder organization",
  ],
  limitations: [
    "Max 500 MB per file upload",
    "No NLE drive mounting",
    "No Gallery or Invoicing tools",
    "Standard support only",
  ],
  cta: "Get Started Free",
};

const plans = [
  {
    name: "Solo Creator",
    tagline: "Essential",
    storage: "1 TB",
    price: 12,
    annualPrice: 108,
    idealUser: "Photographers and small creators",
    description: "Backing up full libraries.",
    features: [
      "1 TB encrypted cloud storage",
      "Upload files up to 20 GB each",
      "Unlimited monthly bandwidth",
      "Smart folder & album organization",
      "Password-protected share links",
      "Client download portals",
      "Basic version history (30 days)",
      "Email support",
    ],
    limitations: ["No NLE drive mounting", "No Gallery or Invoicing tools"],
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
    idealUser: "Solo filmmakers",
    description: "Cutting shorts, docs, and branded content.",
    features: [
      "2 TB encrypted cloud storage",
      "Upload files up to 50 GB each (RAW & ProRes ready)",
      "Unlimited monthly bandwidth",
      "60-day version history & file recovery",
      "Invite up to 2 collaborators (view/comment)",
      "Expiring download links for clients",
      "Review & approval workflow",
      "Priority email support",
    ],
    limitations: ["No NLE drive mounting", "No Gallery or Invoicing tools"],
    cta: "Choose Indie Filmmaker",
    accentColor: BIZZI_BYTE_COLORS.habanero,
  },
  {
    name: "Video Pro",
    tagline: "Professional",
    storage: "5 TB",
    price: 45,
    annualPrice: 405,
    idealUser: "Video creators and editors",
    description: "Multi-cam projects and client deliverables.",
    features: [
      "5 TB encrypted cloud storage",
      "Upload files up to 200 GB each",
      "Accelerated upload & download speeds",
      "90-day version history & recovery",
      "Invite up to 5 collaborators (full permissions)",
      "Client portal with branded delivery pages",
      "Frame-accurate video review tools",
      "Automated project archiving",
      "Priority chat & email support",
    ],
    limitations: [
      "No NLE drive mounting",
      "Gallery & Invoicing add-on available (+$8/mo)",
    ],
    cta: "Choose Video Pro",
    accentColor: BIZZI_BYTE_COLORS.frost,
  },
  {
    name: "Gallery & Studio",
    tagline: "Photographer Suite",
    storage: "5 TB",
    price: 55,
    annualPrice: 495,
    idealUser: "Professional photographers",
    description: "From shoot to invoice — complete business toolkit.",
    features: [
      "5 TB cloud storage (RAW + JPEG optimized)",
      "Automatic RAW + JPEG pairing",
      "AI-assisted photo culling & tagging",
      "90-day version history & recovery",
      "Unlimited branded client galleries",
      "Client proofing — favorites, comments, approvals",
      "Bizzi Invoicing — invoices, deposits, payments",
      "Invite up to 3 second shooters / assistants",
      "Priority support with dedicated onboarding",
    ],
    cta: "Choose Gallery & Studio",
    accentColor: BIZZI_BYTE_COLORS.bubble,
  },
  {
    name: "Production House",
    tagline: "Production",
    storage: "10 TB",
    price: 80,
    annualPrice: 720,
    idealUser: "Agencies and production teams",
    description: "High-volume, high-stakes creative work.",
    features: [
      "10 TB encrypted, redundant cloud storage",
      "Unlimited file size uploads",
      "Priority throughput & transfer speeds",
      "Unlimited version history & project snapshots",
      "Up to 10 team seats with role permissions",
      "Shared team project workspaces",
      "Advanced client delivery & review portals",
      "SSO & advanced access controls",
      "Dedicated account manager + SLA",
    ],
    addOns: ["Gallery & Invoicing suite (+$8/mo)", "NLE Cloud Drive add-on"],
    cta: "Choose Production House",
    accentColor: BIZZI_BYTE_COLORS.onyx,
  },
  {
    name: "Edit Suite",
    tagline: "NLE Cloud Editor",
    storage: "10 TB",
    price: 95,
    annualPrice: 855,
    idealUser: "Editors cutting from the cloud",
    description: "Mount Bizzi as your NLE drive — edit with Rec.709 LUTs on RAW.",
    features: [
      "Bizzi NLE Drive — mount as local drive in Premiere, Resolve, FCP, Avid",
      "Real-time streaming of R3D, BRAW, ProRes RAW, ARRIRAW",
      "Smart cache — frequently accessed clips cached locally",
      "Rec.709 LUT library (50+ packs)",
      "10 TB high-throughput NLE-optimized storage",
      "Up to 5 editors at once",
      "Dedicated NLE support (4-hour response SLA)",
    ],
    cta: "Choose Edit Suite",
    accentColor: BIZZI_BYTE_COLORS.citrus,
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
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Storage that scales with your craft. From your first upload to your
            most ambitious production — every plan built for how creators
            actually work.
          </p>
        </div>

        {/* Free Tier */}
        <div className="mb-16">
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
                  $0<span className="text-base font-normal text-neutral-500">/mo</span>
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

        {/* Paid Plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {plans.map((plan) => {
            const accent = plan.accentColor;
            return (
            <div
              key={plan.name}
              className="relative rounded-2xl border-2 bg-white p-6 flex flex-col transition-all duration-200 hover:shadow-lg"
              style={{
                borderColor: plan.popular ? accent : accent + "50",
                boxShadow: plan.popular ? `0 10px 15px -3px ${accent}25, 0 0 0 2px ${accent}30` : undefined,
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
              <p className="text-neutral-600 text-sm mt-1">{plan.description}</p>
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
                  Cloud Storage
                </span>
                <span className="text-lg font-semibold text-neutral-900">
                  {plan.storage}
                </span>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm text-neutral-700 flex-grow">
                {plan.features.slice(0, 5).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="shrink-0" style={{ color: accent }}>✓</span>
                    {f}
                  </li>
                ))}
                {plan.features.length > 5 && (
                  <li className="text-neutral-500">
                    +{plan.features.length - 5} more
                  </li>
                )}
              </ul>
              {plan.limitations && plan.limitations.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
                  {plan.limitations.slice(0, 2).map((l) => (
                    <li key={l}>— {l}</li>
                  ))}
                </ul>
              )}
              {plan.addOns && (
                <p className="mt-2 text-xs text-neutral-500">
                  Add-ons: {plan.addOns.join(" · ")}
                </p>
              )}
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
                Custom storage, unlimited seats, shared team workspaces,
                dedicated infrastructure, and SLA-backed uptime. Built for
                agencies, post-houses, broadcast studios, and streaming
                platforms.
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
          All plans include AES-256 encryption at rest and in transit · 30-day
          money-back guarantee · Cancel anytime
        </p>
      </div>
    </section>
  );
}
