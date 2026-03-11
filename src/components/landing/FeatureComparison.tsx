const features = [
  {
    tier: "Starter",
    items: [
      "Up to 5 GB of storage",
      "1 brand workspace",
      "Basic asset organization",
      "Smart search & tags",
      "Standard sharing",
      "Email support",
    ],
  },
  {
    tier: "Pro",
    items: [
      "Up to 200 GB of storage",
      "Multiple brand workspaces",
      "Advanced settings",
      "Version control & brand",
      "Collaboration tools",
      "Priority support",
    ],
  },
  {
    tier: "Enterprise",
    items: [
      "Unlimited storage",
      "Custom domains",
      "SSO & advanced security",
      "Custom integrations",
      "Dedicated account manager",
      "24/7 premium support",
    ],
  },
];

export default function FeatureComparison() {
  return (
    <section className="py-20 md:py-28 px-6 bg-bizzi-sky/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy mb-4">
            Compare plans
          </h2>
          <p className="text-lg text-neutral-600">
            See what&apos;s included in each tier.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((tier) => (
            <div
              key={tier.tier}
              className="rounded-2xl bg-white p-6 md:p-8 shadow-lg border border-neutral-100"
            >
              <h3 className="text-lg font-semibold text-bizzi-navy mb-6">
                {tier.tier}
              </h3>
              <ul className="space-y-4">
                {tier.items.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-bizzi-blue/20 flex items-center justify-center">
                      <svg
                        className="w-3.5 h-3.5 text-bizzi-blue"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </span>
                    <span className="text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
