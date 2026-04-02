import type { Metadata } from "next";
import WaitlistForm from "@/components/marketing/WaitlistForm";
import { WaitlistPageStructuredData } from "@/components/seo/WaitlistPageStructuredData";
import {
  SITE_NAME,
  SITE_URL,
  WAITLIST_DESCRIPTION,
  WAITLIST_KEYWORDS,
  WAITLIST_PATH,
  WAITLIST_TITLE,
} from "@/lib/seo";

const waitlistUrl = `${SITE_URL}${WAITLIST_PATH}`;

export const metadata: Metadata = {
  title: {
    absolute: WAITLIST_TITLE,
  },
  description: WAITLIST_DESCRIPTION,
  keywords: [...WAITLIST_KEYWORDS],
  alternates: {
    canonical: waitlistUrl,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: waitlistUrl,
    siteName: SITE_NAME,
    title: WAITLIST_TITLE,
    description: WAITLIST_DESCRIPTION,
    images: [
      {
        url: `${WAITLIST_PATH}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Bizzi Cloud waitlist form preview on a light gradient background",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: WAITLIST_TITLE,
    description: WAITLIST_DESCRIPTION,
    images: [`${WAITLIST_PATH}/opengraph-image`],
  },
  category: "technology",
};

export default function WaitlistPage() {
  return (
    <div className="waitlist-page-shell min-h-screen text-slate-900">
      <WaitlistPageStructuredData />
      <main
        id="main-content"
        className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-12 sm:px-6 sm:py-16 md:px-8 md:py-20"
      >
        <WaitlistForm />
      </main>
    </div>
  );
}
