import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform Documentation",
  description:
    "Complete breakdown of every Bizzi Cloud component, workflow, email, and UI—explained in plain language for clients and stakeholders.",
  robots: { index: false, follow: false },
};

export default function BackendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
