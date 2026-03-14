"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

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
    <footer className="py-16 px-6 bg-white border-t border-neutral-200">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Image
                src="/logo.png"
                alt="Bizzi Byte"
                width={28}
                height={28}
                className="object-contain"
              />
              <span className="font-semibold text-lg text-bizzi-navy">
                Bizzi <span className="text-bizzi-blue">Cloud</span>
              </span>
            </Link>
            <p className="text-sm text-neutral-600 mb-4">Join our newsletter</p>
            <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-bizzi-blue/50 focus:border-bizzi-blue"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-bizzi-blue text-white text-sm font-medium rounded-lg hover:bg-bizzi-cyan transition-colors"
              >
                Subscribe
              </button>
            </form>
          </div>
          <div>
            <h4 className="font-semibold text-bizzi-navy mb-4">Company</h4>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-sm text-neutral-600 hover:text-bizzi-navy transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-bizzi-navy mb-4">Pages</h4>
            <ul className="space-y-2">
              {pagesLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-sm text-neutral-600 hover:text-bizzi-navy transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="font-semibold text-bizzi-navy mt-6 mb-4">Social Media</h4>
            <ul className="space-y-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-neutral-600 hover:text-bizzi-navy transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-12 pt-8 border-t border-neutral-200 text-center text-sm text-neutral-500">
          Bizzi Byte est. 2025
        </p>
      </div>
    </footer>
  );
}
