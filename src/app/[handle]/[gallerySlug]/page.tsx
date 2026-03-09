import { getAdminFirestore } from "@/lib/firebase-admin";
import { isReservedHandle } from "@/lib/public-handle";
import { notFound } from "next/navigation";
import GalleryView from "@/components/gallery/GalleryView";

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
