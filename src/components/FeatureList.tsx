const features = [
  "Secure, encrypted storage",
  "Fast sync across devices",
  "Access from anywhere",
  "Works with your SSD workflow",
  "Simple subscription plans",
];

export default function FeatureList() {
  return (
    <section className="py-16 md:py-20 px-6 border-t border-neutral-100">
      <div className="max-w-2xl mx-auto">
        <ul className="space-y-4">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-3 text-neutral-700"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-bizzi-blue flex-shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
