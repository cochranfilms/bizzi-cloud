import Link from "next/link";

export default function CTA() {
  return (
    <section className="py-20 md:py-28 px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)",
        }}
      />
      <div className="max-w-2xl mx-auto text-center relative z-10">
        <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy tracking-tight mb-4">
          Ready to take control of your brand?
        </h2>
        <p className="text-neutral-600 text-lg mb-8">
          Store, manage, and share every brand file effortlessly—all from one
          powerful platform that keeps your entire team organized and on-brand.
        </p>
        <Link
          href="#pricing"
          className="inline-block px-10 py-4 bg-bizzi-blue text-white font-semibold rounded-full hover:bg-bizzi-cyan transition-colors shadow-lg shadow-bizzi-blue/25"
        >
          Try it free for 14 days
        </Link>
      </div>
    </section>
  );
}
