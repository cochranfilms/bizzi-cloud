import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative py-24 md:py-32 px-6 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: "url(/Hero-BG.png)" }}
        aria-hidden
      />
      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-neutral-900 mb-6">
          Cloud storage built for creators.
        </h1>
        <p className="text-lg md:text-xl text-neutral-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          Fast, reliable storage that follows your workflow. From your Bizzi Byte
          SSD to the cloud—access your projects anywhere, anytime.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-bizzi-blue text-white font-medium rounded-full hover:bg-bizzi-cyan transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="#features"
            className="px-6 py-3 text-neutral-700 font-medium hover:text-neutral-900 transition-colors"
          >
            Learn more
          </Link>
        </div>
      </div>
    </section>
  );
}
