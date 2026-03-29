"use client";

import { useParams, usePathname } from "next/navigation";
import GalleryProofingWorkspace from "@/components/gallery/GalleryProofingWorkspace";

export default function GalleryProofingPage() {
  const params = useParams();
  const pathname = usePathname();
  const navBase =
    typeof pathname === "string" && pathname.startsWith("/team/")
      ? (/^(\/team\/[^/]+)/.exec(pathname)?.[1] ?? "/dashboard")
      : "/dashboard";
  const galleriesRoot = `${navBase}/galleries`;
  const id = params?.id as string;

  return (
    <GalleryProofingWorkspace
      galleryId={id}
      galleryDetailHref={`${navBase}/galleries/${id}`}
      galleriesListHref={galleriesRoot}
    />
  );
}
