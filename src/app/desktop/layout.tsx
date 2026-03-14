import type { Metadata } from "next";
import { SITE_URL, siteConfig } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Desktop App | Edit directly from the cloud",
  description:
    "Mount your Bizzi Cloud drive as a local volume. Work in Premiere Pro, DaVinci Resolve, and Final Cut Pro without downloading—files stream on demand like a virtual SSD. macOS Apple Silicon.",
  alternates: { canonical: `${SITE_URL}/desktop` },
  openGraph: {
    title: "Bizzi Cloud Desktop | Edit directly from the cloud",
    description:
      "Mount your Bizzi Cloud drive as a local volume. Edit in Premiere, Resolve, and Final Cut without downloading. macOS Apple Silicon.",
    url: `${SITE_URL}/desktop`,
    siteName: siteConfig.name,
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bizzi Cloud Desktop | Edit directly from the cloud",
  },
  robots: { index: true, follow: true },
};

/**
 * Root desktop layout. The landing page at /desktop renders here without auth.
 * The app at /desktop/app/* uses its own layout with auth guard.
 */
export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
