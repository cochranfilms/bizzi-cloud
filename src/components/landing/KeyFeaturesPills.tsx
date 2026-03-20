"use client";

const features = [
  {
    title: "Edit Directly From The Cloud",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
    active: true,
  },
  {
    title: "Photo Gallery Creation",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    ),
    active: false,
  },
  {
    title: "Store And Share Files Seamlessly",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
    ),
    active: false,
  },
];

export default function KeyFeaturesPills() {
  return (
    <section className="py-12 md:py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-bizzi-navy mb-2">
            Key features
          </h2>
          <p className="text-neutral-600">
            Why your team needs better cloud storage.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className={`flex items-center gap-3 px-6 py-3 rounded-full border-2 transition-colors ${
                f.active
                  ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                  : "border-bizzi-navy/30 text-bizzi-navy hover:border-bizzi-blue/50"
              }`}
            >
              <span className="flex-shrink-0">{f.icon}</span>
              <span className="font-medium">{f.title}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-neutral-600 text-sm mt-8 max-w-md mx-auto">
          All Storage Is Encrypted And Secured.
        </p>
      </div>
    </section>
  );
}
