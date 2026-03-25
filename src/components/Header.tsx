"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const navLinks: { href: string; label: string; external?: boolean }[] = [
  { href: "/", label: "Home" },
  { href: "#how-it-works", label: "About us" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "Contact" },
];

const pagesItems: { href: string; label: string; external?: boolean }[] = [
  { href: "/desktop", label: "Download for Desktop" },
  { href: "#features", label: "Features" },
  { href: "https://www.bizzibytestorage.com/", label: "Shop SSDs", external: true },
];

const glassNav =
  "rounded-full border border-white/55 bg-white/45 shadow-[0_8px_32px_rgba(31,56,92,0.08)] backdrop-blur-xl";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const pagesRef = useRef<HTMLLIElement>(null);
  const { user, loading } = useAuth();
  const isSignedIn = !!user && !loading;

  useEffect(() => {
    if (!pagesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pagesRef.current && !pagesRef.current.contains(e.target as Node)) {
        setPagesOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pagesOpen]);

  return (
    <header className="relative z-50 px-3 sm:px-6 pt-5 sm:pt-6 pb-2">
      <nav
        className={`mx-auto max-w-5xl ${glassNav} px-3 py-2 sm:px-5 sm:py-2.5 relative flex items-center gap-2`}
        aria-label="Main"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-full py-1 pr-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 ring-1 ring-neutral-900/10 shadow-sm">
            <Image
              src="/logo.png"
              alt=""
              width={22}
              height={22}
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
                className="text-sm font-medium text-neutral-700 hover:text-neutral-950 transition-colors whitespace-nowrap"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li className="relative" ref={pagesRef}>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-neutral-950 transition-colors whitespace-nowrap"
              aria-expanded={pagesOpen}
              aria-haspopup="true"
              onClick={() => setPagesOpen((o) => !o)}
            >
              Pages
              <svg
                className={`h-3.5 w-3.5 opacity-70 transition-transform ${pagesOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {pagesOpen && (
              <div
                className="absolute left-1/2 top-full z-50 mt-3 w-56 -translate-x-1/2 rounded-2xl border border-white/60 bg-white/80 py-2 shadow-lg backdrop-blur-xl md:left-0 md:translate-x-0"
                role="menu"
              >
                {pagesItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    className="block px-4 py-2.5 text-sm text-neutral-700 hover:bg-white/60 hover:text-neutral-950 transition-colors"
                    role="menuitem"
                    onClick={() => setPagesOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </li>
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
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
      </nav>

      {mobileMenuOpen && (
        <div
          className={`mx-auto mt-3 max-w-5xl overflow-hidden rounded-3xl border border-white/55 bg-white/50 px-4 py-4 shadow-lg backdrop-blur-xl md:hidden`}
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
            <li className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Pages
            </li>
            {pagesItems.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  className="block rounded-xl px-3 py-2.5 text-sm text-neutral-700 hover:bg-white/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
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
