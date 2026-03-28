import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TransferProvider } from "@/context/TransferContext";
import { AuthProvider } from "@/context/AuthContext";
import { I18nProvider } from "@/i18n/I18nProvider";
import { siteConfig, SITE_URL } from "@/lib/seo";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { RootThemeProvider } from "@/components/RootThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: siteConfig.title,
    template: "%s | Bizzi Cloud",
  },
  description: siteConfig.description,
  keywords: [
    "cloud storage",
    "creator storage",
    "video storage",
    "photo storage",
    "Bizzi Byte",
    "cloud storage for creators",
    "creative workflow",
    "file sharing",
    "client delivery",
    "gallery proofing",
  ],
  authors: [{ name: "Bizzi Cloud", url: SITE_URL }],
  creator: "Bizzi Cloud",
  publisher: "Bizzi Cloud",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: siteConfig.title }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
    images: ["/opengraph-image"],
  },
  alternates: {
    canonical: SITE_URL,
  },
  category: "technology",
  verification: {
    // Add when you have them: google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-white text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 font-sans min-h-screen">
        <RootThemeProvider>
          <AuthProvider>
            <I18nProvider>
              <TransferProvider>
                {children}
                <CookieConsentBanner />
              </TransferProvider>
            </I18nProvider>
          </AuthProvider>
        </RootThemeProvider>
      </body>
    </html>
  );
}
