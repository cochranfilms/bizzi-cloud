import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Signed out",
  description: "You have been signed out of Bizzi Cloud.",
  robots: { index: false, follow: true },
  alternates: { canonical: `${SITE_URL}/signed-out` },
};

export default function SignedOutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
