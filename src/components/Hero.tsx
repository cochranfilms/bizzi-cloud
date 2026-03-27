"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function Hero() {
  const { user, loading } = useAuth();
  const isSignedIn = !!user && !loading;

  return (
    <section className="relative flex min-h-[min(85vh,920px)] flex-col items-center justify-center px-4 pb-16 pt-6 text-center sm:px-6 sm:pb-24 sm:pt-8 md:pb-28">
      <div className="relative z-10 max-w-3xl mx-auto w-full">
        <div
          className="inline-flex items-center gap-2 rounded-full border border-white/55 bg-white/35 px-3.5 py-1.5 sm:px-4 text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-bizzi-navy/90 backdrop-blur-md shadow-sm mb-6 sm:mb-8"
          role="note"
        >
          <svg
            className="h-3.5 w-3.5 text-bizzi-navy/80 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6-4.7-6 4.7 2.3-7-6-4.6h7.6L12 2z" />
          </svg>
          Built for creative workflows
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-bizzi-navy mb-4 sm:mb-6 text-balance">
          Your workflow optimized in the <em className="font-semibold italic">cloud</em>.
        </h1>

        <p className="text-base sm:text-lg md:text-xl text-neutral-700 max-w-2xl mx-auto leading-relaxed mb-8 sm:mb-10 text-pretty">
          High-performance storage, engineered for post-production workflows.
        </p>

        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Link
            href={isSignedIn ? "/dashboard" : "#pricing"}
            className="inline-flex items-center justify-center min-w-[200px] px-8 py-3.5 rounded-full bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors shadow-lg shadow-neutral-900/15"
          >
            {isSignedIn ? "Go to Dashboard" : "Get started"}
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center min-w-[200px] px-8 py-3.5 rounded-full bg-white/80 text-neutral-900 text-sm font-semibold border border-white/70 backdrop-blur-md hover:bg-white/95 transition-colors shadow-md shadow-neutral-900/5"
          >
            Learn more
          </Link>
        </div>
      </div>
    </section>
  );
}
