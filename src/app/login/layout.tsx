import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to Bizzi Cloud. Cloud storage built for creators—store, share, and deliver your projects from anywhere.",
  alternates: { canonical: `${SITE_URL}/login` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Sign In | Bizzi Cloud",
    description: "Sign in to Bizzi Cloud. Cloud storage for videographers, photographers, and creative teams.",
    url: `${SITE_URL}/login`,
    type: "website",
  },
  twitter: { card: "summary", title: "Sign In | Bizzi Cloud" },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
