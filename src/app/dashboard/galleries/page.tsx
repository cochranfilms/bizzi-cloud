import TopBar from "@/components/dashboard/TopBar";
import GalleryGrid from "@/components/dashboard/GalleryGrid";
import AddonGuard from "@/components/dashboard/AddonGuard";

export default function GalleriesPage() {
  return (
    <>
      <TopBar title="Galleries" />
      <main className="mt-4 flex-1 min-h-0 overflow-auto px-4 py-5 sm:mt-6 sm:px-6 sm:py-6">
        <AddonGuard require="gallery" featureName="Bizzi Gallery Suite">
          <GalleryGrid />
        </AddonGuard>
      </main>
    </>
  );
}
