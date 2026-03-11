"use client";

import Image from "next/image";

const BRAND_LOGOS = [
  { name: "Bizzi Byte", logo: "/logo.png" },
  { name: "Creative Pro", label: "Creative Pro" },
  { name: "Studio Flow", label: "Studio Flow" },
  { name: "Pixel Works", label: "Pixel Works" },
  { name: "Frame House", label: "Frame House" },
  { name: "Edit Suite", label: "Edit Suite" },
  { name: "Visual Lab", label: "Visual Lab" },
  { name: "Media Hub", label: "Media Hub" },
];

export default function TrustedByBrands() {
  return (
    <section className="py-12 md:py-16 overflow-hidden bg-white/60">
      <div className="text-center mb-8">
        <h2 className="text-xl md:text-2xl font-semibold text-bizzi-navy">
          Trusted by brands
        </h2>
      </div>
      <div className="relative">
        <div className="flex animate-logo-scroll gap-16 md:gap-24 px-4">
          {/* Duplicate for seamless infinite scroll */}
          {[...BRAND_LOGOS, ...BRAND_LOGOS].map((brand, i) => (
            <div
              key={`${brand.name}-${i}`}
              className="flex-shrink-0 flex items-center justify-center min-w-[120px]"
            >
              {brand.logo ? (
                <Image
                  src={brand.logo}
                  alt={brand.name}
                  width={120}
                  height={40}
                  className="h-8 md:h-10 w-auto object-contain opacity-70 grayscale hover:opacity-90 hover:grayscale-0 transition-all"
                />
              ) : (
                <span className="text-sm md:text-base font-semibold text-neutral-400 whitespace-nowrap tracking-tight">
                  {brand.label ?? brand.name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
