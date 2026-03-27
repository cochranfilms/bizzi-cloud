import TopBar from "@/components/dashboard/TopBar";
import CreatorContent from "@/components/dashboard/CreatorContent";
import AddonGuard from "@/components/dashboard/AddonGuard";

export default function EnterpriseCreatorPage() {
  return (
    <>
      <TopBar title="Creator" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <AddonGuard require="editor" featureName="Bizzi Editor">
          <CreatorContent />
        </AddonGuard>
      </main>
    </>
  );
}
