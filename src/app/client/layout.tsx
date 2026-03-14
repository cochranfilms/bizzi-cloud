import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "My Galleries",
  description:
    "View your invited galleries on Bizzi Cloud. Client portal for photographers and videographers to share work with you.",
  alternates: { canonical: `${SITE_URL}/client` },
  robots: { index: false, follow: true },
  openGraph: {
    title: "My Galleries | Bizzi Cloud Client Portal",
    description: "View your invited galleries on Bizzi Cloud.",
    url: `${SITE_URL}/client`,
    type: "website",
  },
};

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
