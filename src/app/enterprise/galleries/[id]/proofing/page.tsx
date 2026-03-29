"use client";

import { useParams } from "next/navigation";
import GalleryProofingWorkspace from "@/components/gallery/GalleryProofingWorkspace";

export default function EnterpriseGalleryProofingPage() {
  const params = useParams();
  const id = params?.id as string;

  return (
    <GalleryProofingWorkspace
      galleryId={id}
      galleryDetailHref={`/enterprise/galleries/${id}`}
      galleriesListHref="/enterprise/galleries"
    />
  );
}
