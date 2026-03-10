import Link from "next/link";
import Image from "next/image";

export default function BrandContinuity() {
  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-3xl mx-auto text-center">
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

