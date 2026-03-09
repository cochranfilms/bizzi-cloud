import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isReservedHandle } from "@/lib/public-handle";
import { notFound } from "next/navigation";
import GalleryView from "@/components/gallery/GalleryView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; gallerySlug: string }>;
}): Promise<Metadata> {
  const { handle: rawHandle, gallerySlug: rawSlug } = await params;
  const handle = rawHandle?.toLowerCase().trim() ?? "";
  const slug = rawSlug?.toLowerCase().trim() ?? "";

  if (!handle || !slug || isReservedHandle(handle)) {
    return { title: "Gallery | Bizzi Cloud" };
  }

  const db = getAdminFirestore();
  const profilesSnap = await db
    .collection("profiles")
    .where("public_slug", "==", handle)
    .limit(1)
    .get();

  if (profilesSnap.empty) return { title: "Gallery | Bizzi Cloud" };

  const photographerId = profilesSnap.docs[0].id;
  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", photographerId)
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (galleriesSnap.empty) return { title: "Gallery | Bizzi Cloud" };

  const galleryData = galleriesSnap.docs[0].data();
  const galleryTitle = galleryData.title ?? "Gallery";
  const displayHandle = handle.charAt(0).toUpperCase() + handle.slice(1);
  const title = `${displayHandle} ${galleryTitle}`;

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base =
    host && proto ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL ?? "https://www.bizzicloud.io";
  const ogImage = `${base}/api/public/galleries/og-image?handle=${encodeURIComponent(handle)}&slug=${encodeURIComponent(slug)}`;

  return {
    title,
    description: galleryData.description ?? `View ${galleryTitle} by ${displayHandle} on Bizzi Cloud.`,
    openGraph: {
      title,
      description: galleryData.description ?? `View ${galleryTitle} by ${displayHandle} on Bizzi Cloud.`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [ogImage],
    },
  };
}

export default async function BrandedGalleryPage({
  params,
}: {
  params: Promise<{ handle: string; gallerySlug: string }>;
}) {
  const { handle, gallerySlug } = await params;

  const normalizedHandle = handle.toLowerCase().trim();
  const normalizedSlug = gallerySlug.toLowerCase().trim();

  if (!normalizedHandle || !normalizedSlug) notFound();
  if (isReservedHandle(normalizedHandle)) notFound();

  const db = getAdminFirestore();

  const profilesSnap = await db
    .collection("profiles")
    .where("public_slug", "==", normalizedHandle)
    .limit(1)
    .get();

  if (profilesSnap.empty) notFound();

  const photographerId = profilesSnap.docs[0].id;

  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", photographerId)
    .where("slug", "==", normalizedSlug)
    .limit(1)
    .get();

  if (galleriesSnap.empty) notFound();

  const galleryId = galleriesSnap.docs[0].id;

  return <GalleryView galleryId={galleryId} />;
}
