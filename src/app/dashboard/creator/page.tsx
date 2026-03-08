import TopBar from "@/components/dashboard/TopBar";
import CreatorContent from "@/components/dashboard/CreatorContent";

export default function CreatorPage() {
  return (
    <>
      <TopBar title="Creator" />
      <main className="flex-1 overflow-auto p-6">
        <CreatorContent />
      </main>
    </>
  );
}
