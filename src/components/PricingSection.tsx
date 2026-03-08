const plans = [
  {
    name: "Starter",
    storage: "1TB",
    price: 12,
    idealUser: "Photographers / small creators",
    description: "Perfect for backing up photo libraries and small creative projects.",
  },
  {
    name: "Creator",
    storage: "2TB",
    price: 20,
    idealUser: "Solo filmmakers",
    description: "Designed for indie creators working on shorts and documentaries.",
    popular: true,
  },
  {
    name: "Pro",
    storage: "5TB",
    price: 45,
    idealUser: "Video creators / editors",
    description: "Scale up for feature edits, multi-cam projects, and client work.",
  },
  {
    name: "Studio",
    storage: "10TB",
    price: 80,
    idealUser: "Production teams",
    description: "Built for agencies and teams shipping high-volume creative work.",
  },
];

const addOns = [
  { storage: "+1TB", price: 7 },
  { storage: "+2TB", price: 12 },
  { storage: "+3TB", price: 16 },
  { storage: "+4TB", price: 20 },
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
            Plans for every creator
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Simple pricing with generous storage. Start small and scale as you grow.
          </p>
        </div>

        {/* Core Plans */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`
                relative rounded-2xl border-2 bg-white p-6 md:p-7 flex flex-col
                transition-all duration-200 hover:shadow-lg hover:shadow-neutral-200/50
                ${
                  plan.popular
                    ? "border-bizzi-blue shadow-lg shadow-bizzi-blue/10 ring-2 ring-bizzi-blue/20"
                    : "border-neutral-200 hover:border-neutral-300"
                }
              `}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-bizzi-blue text-white">
                    Most popular
                  </span>
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-neutral-900">
                  {plan.name}
                </h3>
                <p className="text-3xl font-bold text-neutral-900 mt-2">
                  ${plan.price}
                  <span className="text-base font-normal text-neutral-500">
                    /mo
                  </span>
                </p>
              </div>
              <div className="mb-1">
                <span className="text-sm font-medium text-neutral-500">
                  Storage included
                </span>
                <p className="text-lg font-semibold text-neutral-900">
                  {plan.storage}
                </p>
              </div>
              <div className="mb-6">
                <span className="text-sm font-medium text-neutral-500">
                  Ideal for
                </span>
                <p className="text-neutral-700 font-medium">{plan.idealUser}</p>
              </div>
              <p className="text-sm text-neutral-600 mb-6 leading-relaxed flex-grow">
                {plan.description}
              </p>
              <button
                type="button"
                className={`
                  w-full py-3 px-4 rounded-xl font-medium transition-colors
                  ${
                    plan.popular
                      ? "bg-bizzi-blue text-white hover:bg-bizzi-cyan"
                      : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                  }
                `}
              >
                Choose plan
              </button>
            </div>
          ))}
        </div>

        {/* Enterprise Plan */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-neutral-900">
                  Enterprise
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-200 text-neutral-700">
                  For teams
                </span>
              </div>
              <p className="text-neutral-600 text-sm mb-4">
                Shared storage and collaboration for teams. Dedicated support,
                priority infrastructure, and flexible terms for high-volume workflows.
              </p>
              <button
                type="button"
                className="inline-flex px-4 py-2 rounded-xl font-medium bg-neutral-100 text-neutral-900 hover:bg-neutral-200 transition-colors text-sm"
              >
                Contact sales
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <span className="text-sm font-medium text-neutral-500">
                  Storage
                </span>
                <span className="text-lg font-semibold text-neutral-900 mt-0.5">
                  16TB
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <span className="text-sm font-medium text-neutral-500">
                  Seats
                </span>
                <span className="text-lg font-semibold text-neutral-900 mt-0.5">
                  Up to 10
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-neutral-50 border border-neutral-100 text-center">
                <span className="text-sm font-medium text-neutral-500">
                  Ideal for
                </span>
                <span className="text-sm font-semibold text-neutral-900 mt-0.5 leading-tight">
                  Agencies, post houses & studios
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Storage Add-Ons */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-1">
                Need more storage?
              </h3>
              <p className="text-neutral-600 text-sm">
                Add extra storage to any plan. Priced per month.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {addOns.map((addOn) => (
                <div
                  key={addOn.storage}
                  className="flex flex-col items-center justify-center p-4 rounded-xl bg-neutral-50 border border-neutral-100"
                >
                  <span className="text-sm font-medium text-neutral-500">
                    {addOn.storage}
                  </span>
                  <span className="text-lg font-semibold text-neutral-900 mt-0.5">
                    ${addOn.price}/mo
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
