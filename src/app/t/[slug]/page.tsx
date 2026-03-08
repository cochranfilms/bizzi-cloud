import type { Metadata } from "next";
import { headers } from "next/headers";
import TransferView from "@/components/transfer/TransferView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? "https://bizzicloud.io");
  try {
    const res = await fetch(`${base}/api/transfers/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return {
        title: "Transfer | Bizzi Cloud",
        description: "View files shared with you via Bizzi Cloud transfer.",
      };
    }
    const data = (await res.json()) as { name?: string; status?: string };
    const title = data.name ? `${data.name} | Bizzi Cloud Transfer` : "Transfer | Bizzi Cloud";
    const ogImage = data.status === "active" ? `${base}/api/transfers/${slug}/og-image` : undefined;
    return {
      title,
      description: "View files shared with you via Bizzi Cloud transfer.",
      openGraph: {
        title,
        description: "View files shared with you via Bizzi Cloud transfer.",
        images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        images: ogImage ? [ogImage] : undefined,
      },
    };
  } catch {
    return {
      title: "Transfer | Bizzi Cloud",
      description: "View files shared with you via Bizzi Cloud transfer.",
    };
  }
}

export default async function TransferPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TransferView slug={slug} />;
}
