import Link from "next/link";

export default function CTA() {
  return (
    <section
      id="waitlist"
      className="py-20 md:py-28 px-6 bg-neutral-900 text-white"
    >
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
          Ready to store more?
        </h2>
        <p className="text-neutral-400 text-lg mb-8">
          Join Bizzi Cloud and keep creating.
        </p>
        <Link
          href="#pricing"
          className="inline-block px-8 py-3 bg-bizzi-blue text-white font-medium rounded-full hover:bg-bizzi-cyan transition-colors"
        >
          Get Started
        </Link>
      </div>
    </section>
  );
}
