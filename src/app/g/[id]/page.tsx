import GalleryView from "@/components/gallery/GalleryView";

export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GalleryView galleryId={id} />;
}
