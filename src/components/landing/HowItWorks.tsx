"use client";

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-20 md:py-28 px-6 relative overflow-hidden"
    >
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy dark:text-sky-50 mb-4">
            How it works
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto">
            How our cloud storage works for creators.
          </p>
        </div>
        {/* Placeholder for video — same size card area */}
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-6 md:p-8 border border-white/50 shadow-lg min-h-[320px] dark:border-white/12 dark:bg-neutral-900/55 dark:shadow-black/30" />
      </div>
    </section>
  );
}
