import Link from "next/link";
import Image from "next/image";

const bizziByteColors = [
  {
    name: "Matcha Byte",
    bg: "bg-[#84cc16]",
    tagline: "Balanced energy meets blazing speed.",
  },
  {
    name: "Habanero Byte",
    bg: "bg-[#dc2626]",
    tagline: "Spicy red with blazing performance.",
  },
  {
    name: "Onyx Byte",
    bg: "bg-[#171717]",
    tagline: "Jet black and engineered for precision—1100MB/s.",
  },
  {
    name: "Bubble Byte",
    bg: "bg-gradient-to-b from-[#ec4899] to-[#f472b6]",
    tagline: "Bold pink, built for creators.",
  },
  {
    name: "Frost Byte",
    bg: "bg-[#38bdf8]",
    tagline: "Cool blue. Crisp performance.",
  },
  {
    name: "Citrus Byte",
    bg: "bg-[#f97316]",
    tagline: "Bright, bold, and built for performance.",
  },
];

export default function BrandContinuity() {
  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-4xl mx-auto text-center mb-12">
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.png"
            alt="Bizzi Byte"
            width={48}
            height={48}
            className="object-contain"
          />
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold text-neutral-900 mb-4">
          From Bizzi Byte
        </h2>
        <p className="text-neutral-600 leading-relaxed mb-8">
          From the makers of Bizzi Byte SSDs—the colorful, creator-first external
          drives. Bizzi Cloud is the same philosophy: fast, reliable, built for
          how creators work.
        </p>
      </div>

      {/* Bizzi Byte color variant cards */}
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4 mb-12">
        {bizziByteColors.map((variant) => (
          <div
            key={variant.name}
            className={`${variant.bg} rounded-2xl p-6 min-h-[140px] flex flex-col justify-between text-white transition-transform hover:scale-[1.02]`}
          >
            <h3 className="text-sm font-bold uppercase tracking-wider">
              {variant.name}
            </h3>
            <p className="text-sm text-white/90 mt-2 leading-snug">
              {variant.tagline}
            </p>
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto text-center">
        <Link
          href="https://www.bizzibytestorage.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-bizzi-blue font-medium hover:text-bizzi-cyan transition-colors"
        >
          Shop Bizzi Byte SSDs
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </Link>
      </div>
    </section>
  );
}
