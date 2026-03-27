"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { smoothScrollToElement } from "@/lib/smooth-scroll";

const navLinks: { href: string; label: string; external?: boolean }[] = [
  { href: "/", label: "Home" },
  { href: "#how-it-works", label: "About us" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "Contact" },
];

const glassNav =
  "border border-white/55 bg-white/45 shadow-[0_8px_32px_rgba(31,56,92,0.08)] backdrop-blur-xl rounded-t-[1.75rem] rounded-b-[999px]";

const landingIntegratedNav =
  "landing-nav-sculpted mx-auto w-[min(56rem,87%)] sm:w-[min(58rem,85%)] border border-neutral-200/70 bg-white text-neutral-900 shadow-[0_14px_44px_rgba(15,23,42,0.07)]";

function scrollToFeaturedWork() {
  const el = document.getElementById("featured-work");
  if (!el) return;
  void smoothScrollToElement(el);
}

type HeaderProps = {
  variant?: "default" | "landingIntegrated";
};

export default function Header({ variant = "default" }: HeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading } = useAuth();
  const isSignedIn = !!user && !loading;

  const isLandingIntegrated = variant === "landingIntegrated";

  return (
    <header
      className={
        isLandingIntegrated
          ? "sticky top-0 z-50 w-full px-3 pb-2 pt-0 sm:px-5 sm:pb-2.5 md:px-6 lg:px-8"
          : "sticky top-0 z-50 w-full px-4 sm:px-8 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3 sm:pb-4"
      }
    >
      <nav
        className={
          isLandingIntegrated
            ? `${landingIntegratedNav} px-2.5 py-2.5 sm:px-5 sm:py-3 md:px-6 md:py-3`
            : `landing-nav-slab mx-auto max-w-5xl ${glassNav} px-3 py-2 sm:px-6 sm:py-2.5`
        }
        aria-label="Main"
      >
        <div
          className={`relative z-10 flex w-full items-center ${isLandingIntegrated ? "gap-1.5 sm:gap-2" : "gap-2"}`}
        >
        <Link
          href="/"
          className={`flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 ${isLandingIntegrated ? "pl-0.5" : ""}`}
        >
          <span
            className={`flex items-center justify-center rounded-full bg-white ring-1 ring-neutral-900/10 shadow-sm ${
              isLandingIntegrated ? "h-10 w-10 sm:h-11 sm:w-11" : "h-9 w-9"
            }`}
          >
            <Image
              src="/logo.png"
              alt=""
              width={isLandingIntegrated ? 24 : 22}
              height={isLandingIntegrated ? 24 : 22}
              className="object-contain"
            />
          </span>
          <span className="hidden min-[400px]:inline font-semibold text-sm sm:text-base tracking-tight text-bizzi-navy">
            Bizzi <span className="text-bizzi-blue">Cloud</span>
          </span>
        </Link>

        <ul className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex items-center gap-5 lg:gap-7">
          {navLinks.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className={`text-sm transition-colors whitespace-nowrap ${
                  link.href === "/" && pathname === "/"
                    ? "font-semibold text-neutral-950"
                    : "font-medium text-neutral-700 hover:text-neutral-950"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/#featured-work"
              className="text-sm font-medium text-neutral-700 hover:text-neutral-950 transition-colors whitespace-nowrap"
              onClick={(e) => {
                if (pathname === "/") {
                  e.preventDefault();
                  scrollToFeaturedWork();
                }
              }}
            >
              Featured Work
            </Link>
          </li>
        </ul>

        <div
          className={`ml-auto flex shrink-0 items-center gap-2 sm:gap-3 ${isLandingIntegrated ? "pr-0.5 sm:pr-1" : ""}`}
        >
          {!isSignedIn && (
            <Link
              href="/login"
              className="hidden sm:inline text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors whitespace-nowrap"
            >
              Sign In
            </Link>
          )}
          {isSignedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 transition-colors shadow-md"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              href="#pricing"
              className="inline-flex items-center rounded-full bg-neutral-900 px-4 py-2 sm:px-5 text-sm font-semibold text-white hover:bg-neutral-800 transition-colors shadow-md whitespace-nowrap"
            >
              Get Started
            </Link>
          )}

          <button
            type="button"
            className={`md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/40 text-neutral-800 backdrop-blur-sm ${mobileMenuOpen ? "ring-2 ring-bizzi-blue/30" : ""}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div
          className={
            isLandingIntegrated
              ? "mx-auto mt-3 w-[min(56rem,87%)] overflow-hidden rounded-3xl border border-neutral-200/80 bg-white px-4 py-4 shadow-lg sm:w-[min(58rem,85%)] md:hidden"
              : "mx-auto mt-3 max-w-5xl overflow-hidden rounded-3xl border border-white/55 bg-white/50 px-4 py-4 shadow-lg backdrop-blur-xl md:hidden"
          }
        >
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-white/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/#featured-work"
                className="block rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-white/60"
                onClick={(e) => {
                  setMobileMenuOpen(false);
                  if (pathname === "/") {
                    e.preventDefault();
                    window.setTimeout(() => scrollToFeaturedWork(), 120);
                  }
                }}
              >
                Featured Work
              </Link>
            </li>
            {!isSignedIn && (
              <li className="mt-2 border-t border-white/50 pt-3">
                <Link
                  href="/login"
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-white/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  );
}
