"use client";

import Link from "next/link";
import { useState } from "react";
import BizziLogoMark from "@/components/BizziLogoMark";

const companyLinks: { href: string; label: string; external?: boolean }[] = [
  { href: "/", label: "Home" },
  { href: "#how-it-works", label: "About" },
  { href: "#features", label: "Features" },
];

const pagesLinks: { href: string; label: string; external?: boolean }[] = [
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "/desktop", label: "Download for Desktop" },
  { href: "https://www.bizzibytestorage.com/", label: "Shop SSDs", external: true },
];

const legalLinks: { href: string; label: string }[] = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy#cookies", label: "Cookie Policy" },
  { href: "/privacy#do-not-sell", label: "Don't Sell My Data" },
];

const socialLinks: { href: string; label: string; external?: boolean }[] = [
  { href: "https://facebook.com", label: "Facebook", external: true },
  { href: "https://linkedin.com", label: "LinkedIn", external: true },
  { href: "https://instagram.com", label: "Instagram", external: true },
];

export default function Footer() {
  const [email, setEmail] = useState("");

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder - wire to your newsletter API
    setEmail("");
  };

  return (
    <footer className="py-12 sm:py-16 px-4 sm:px-6 border-t border-white/40 bg-white/35 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/50">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 sm:gap-12">
          <div className="sm:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <BizziLogoMark width={28} height={28} />
              <span className="font-semibold text-lg text-bizzi-navy dark:text-sky-100">
                Bizzi <span className="text-bizzi-blue dark:text-bizzi-cyan">Cloud</span>
              </span>
            </Link>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">Join our newsletter</p>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-lg border border-neutral-200 bg-white px-4 py-3 sm:py-2 text-sm w-full sm:w-48 min-h-[44px] sm:min-h-0 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-bizzi-blue/50 focus:border-bizzi-blue dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
              <button
                type="submit"
                className="px-4 py-3 sm:py-2 min-h-[44px] sm:min-h-0 bg-bizzi-blue text-white text-sm font-medium rounded-lg hover:bg-bizzi-cyan transition-colors"
              >
                Subscribe
              </button>
            </form>
          </div>
          <div>
            <h4 className="font-semibold text-bizzi-navy dark:text-sky-100 mb-4">Legal</h4>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-neutral-600 hover:text-bizzi-navy transition-colors dark:text-neutral-300 dark:hover:text-bizzi-cyan"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-bizzi-navy dark:text-sky-100 mb-4">Company</h4>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-sm text-neutral-600 hover:text-bizzi-navy transition-colors dark:text-neutral-300 dark:hover:text-bizzi-cyan"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-bizzi-navy dark:text-sky-100 mb-4">Pages</h4>
            <ul className="space-y-2">
              {pagesLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-sm text-neutral-600 hover:text-bizzi-navy transition-colors dark:text-neutral-300 dark:hover:text-bizzi-cyan"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="font-semibold text-bizzi-navy dark:text-sky-100 mt-6 mb-4">Social Media</h4>
            <ul className="space-y-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-neutral-600 hover:text-bizzi-navy transition-colors dark:text-neutral-300 dark:hover:text-bizzi-cyan"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-600 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Bizzi Byte est. 2025
        </p>
      </div>
    </footer>
  );
}
