import type { Metadata } from "next";
import { headers } from "next/headers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const normalizedHandle = slug?.toLowerCase().trim() ?? "";
  const displayHandle =
    normalizedHandle.charAt(0).toUpperCase() + normalizedHandle.slice(1);
  const title = `${displayHandle} Gallery`;
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base =
    host && proto ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL ?? "https://www.bizzicloud.io";
  const ogImage = normalizedHandle
    ? `${base}/api/public/studios/${encodeURIComponent(normalizedHandle)}/og-image`
    : undefined;

  return {
    title,
    description: `Browse ${displayHandle}'s photo galleries on Bizzi Cloud.`,
    openGraph: {
      title,
      description: `Browse ${displayHandle}'s photo galleries on Bizzi Cloud.`,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default function StudioHomepageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
