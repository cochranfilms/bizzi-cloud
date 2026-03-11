"use client";

const steps = [
  {
    title: "Upload & Organize",
    description:
      "Select and upload the files to your choice. Fast, reliable storage that follows your workflow.",
    icon: (
      <svg
        className="w-10 h-10 text-bizzi-blue"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    ),
  },
  {
    title: "Progress Analyse",
    description:
      "Track which assets are used most and ensure your brand stays consistent across every channel.",
    icon: (
      <svg
        className="w-10 h-10 text-bizzi-blue"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    title: "File Sharing",
    description:
      "Use smart share links and approval workflows to keep everything accessible and secure.",
    icon: (
      <svg
        className="w-10 h-10 text-bizzi-blue"
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
  },
  {
    title: "Security Control",
    description:
      "Keep your files secure. Control who can view, edit, or download across your entire team.",
    icon: (
      <svg
        className="w-10 h-10 text-bizzi-blue"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
  {
    title: "File Update",
    description:
      "Replace outdated files instantly across all channels. One update, everywhere.",
    icon: (
      <svg
        className="w-10 h-10 text-bizzi-blue"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-20 md:py-28 px-6 relative overflow-hidden"
    >
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)",
        }}
      />
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy mb-4">
            How it works
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            How our cloud storage works for creators.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {steps.slice(0, 3).map((step) => (
            <div
              key={step.title}
              className="rounded-2xl bg-white/90 backdrop-blur-sm p-6 md:p-8 border border-white/50 shadow-lg"
            >
              <div className="mb-4">{step.icon}</div>
              <h3 className="text-xl font-semibold text-bizzi-navy mb-2">
                {step.title}
              </h3>
              <p className="text-neutral-600 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6 md:gap-8 mt-6 max-w-4xl mx-auto">
          {steps.slice(3).map((step) => (
            <div
              key={step.title}
              className="rounded-2xl bg-white/90 backdrop-blur-sm p-6 md:p-8 border border-white/50 shadow-lg"
            >
              <div className="mb-4">{step.icon}</div>
              <h3 className="text-xl font-semibold text-bizzi-navy mb-2">
                {step.title}
              </h3>
              <p className="text-neutral-600 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
