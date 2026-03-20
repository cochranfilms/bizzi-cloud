"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import CloudBackground from "@/components/landing/CloudBackground";

export default function Hero() {
  const { user, loading } = useAuth();
  const isSignedIn = !!user && !loading;

  return (
    <section className="relative py-14 sm:py-20 md:py-28 px-4 sm:px-6 overflow-hidden min-h-[400px] sm:min-h-[500px] flex items-center">
      <CloudBackground />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-bizzi-navy mb-4 sm:mb-6">
              Your workflow optimized in the cloud.
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-neutral-600 mb-6 sm:mb-8 max-w-xl leading-relaxed">
              Bizzi Cloud is the cloud storage platform built exclusively for
              photographers, filmmakers, and creative teams who need more than
              generic file storage. We give creators a secure, organized home for
              every asset they make. Built around the post-production workflows
              and efficiency that creative work actually demands.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              <Link
                href={isSignedIn ? "/dashboard" : "#pricing"}
                className="inline-block px-8 py-3.5 bg-bizzi-blue text-white font-semibold rounded-full hover:bg-bizzi-cyan transition-colors shadow-lg shadow-bizzi-blue/25"
              >
                {isSignedIn ? "Go to Dashboard" : "Try it free for 14 days"}
              </Link>
              <Link
                href="/desktop"
                className="inline-block px-8 py-3.5 border-2 border-bizzi-navy text-bizzi-navy font-semibold rounded-full hover:bg-bizzi-navy/5 transition-colors"
              >
                Download for Desktop
              </Link>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div
              className="rounded-2xl p-8 shadow-xl border border-white/50 backdrop-blur-sm"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(224,242,254,0.5) 100%)",
              }}
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-bizzi-navy font-medium">
                  <span className="w-2 h-2 rounded-full bg-bizzi-blue" />
                  Announcements
                </div>
                <p className="text-neutral-600">
                  Keep every file organized in one place.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Organize file", "Image", "Video", "Logo", "Design"].map(
                    (item, i) => (
                      <span
                        key={item}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                          i === 0
                            ? "bg-bizzi-blue/15 text-bizzi-blue"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {item}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
