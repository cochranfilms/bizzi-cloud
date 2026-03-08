import TopBar from "@/components/dashboard/TopBar";
import GalleryGrid from "@/components/dashboard/GalleryGrid";

export default function GalleriesPage() {
  return (
    <>
      <TopBar title="Galleries" />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <GalleryGrid />
      </main>
    </>
  );
}
