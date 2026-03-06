import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TransferProvider } from "@/context/TransferContext";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bizzi Cloud | Cloud storage built for creators",
  description:
    "Fast, reliable cloud storage that follows your workflow. From your Bizzi Byte SSD to the cloud—access your projects anywhere, anytime.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased bg-white text-neutral-800 font-sans min-h-screen">
        <AuthProvider>
          <TransferProvider>{children}</TransferProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
