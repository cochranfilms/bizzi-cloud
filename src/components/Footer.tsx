import Link from "next/link";
import Image from "next/image";

const footerLinks = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "/dashboard", label: "Sign In" },
  { href: "https://www.bizzibytestorage.com/", label: "Shop SSDs", external: true },
  { href: "mailto:contact@bizzibyte.com", label: "Contact", external: true },
];

export default function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-neutral-200">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Bizzi Byte"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="font-semibold text-neutral-900">
              Bizzi <span className="text-bizzi-blue">Cloud</span>
            </span>
          </Link>
          <nav>
            <ul className="flex flex-wrap items-center justify-center gap-6 md:gap-8">
              {footerLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mt-8 text-center text-sm text-neutral-500">
          Bizzi Byte est. 2025
        </p>
      </div>
    </footer>
  );
}
