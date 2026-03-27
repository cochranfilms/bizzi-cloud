import TopBar from "@/components/dashboard/TopBar";
import CreatorContent from "@/components/dashboard/CreatorContent";
import AddonGuard from "@/components/dashboard/AddonGuard";

export default function CreatorPage() {
  return (
    <>
      <TopBar
        title="Creator"
        showLayoutSettings
        settingsHref="/dashboard/creator/settings"
      />
      <main className="flex-1 overflow-auto p-6">
        <AddonGuard
          require="editor"
          featureName="Bizzi Editor"
          upgradeMessage="Mount your cloud as a virtual SSD for NLE editing."
        >
          <CreatorContent />
        </AddonGuard>
      </main>
    </>
  );
}
